// Drives headless Chrome over the DevTools protocol, runs each test scenario,
// and saves a full-page screenshot + the Network-panel timings for each one.
// Usage: node tools/capture-evidence.mjs [03 05 ...]   (needs tools/serve.py running on :8820)

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE = 'http://localhost:8820';
const OUT = fileURLToPath(new URL('../evidence/', import.meta.url));
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scenarios = [
  { name: '01-slow-item-eevee', page: 'fixed', steps: [['pick', 'eevee']], wait: 4800 },
  { name: '02-fast-item-gholdengo', page: 'fixed', steps: [['pick', 'gholdengo']], wait: 4800 },
  { name: '03-broken-race', page: 'broken', steps: [['pick', 'eevee'], ['sleep', 50], ['pick', 'gholdengo']], wait: 5000 },
  { name: '04-fixed-race', page: 'fixed', steps: [['pick', 'eevee'], ['sleep', 50], ['pick', 'gholdengo']], wait: 5000 },
  { name: '05-broken-race-midchain', page: 'broken', steps: [['pick', 'eevee'], ['sleep', 2600], ['pick', 'gholdengo'], ['sleep', 1550], ['shot', 'during']], wait: 3000 },
  { name: '06-fixed-race-midchain', page: 'fixed', steps: [['pick', 'eevee'], ['sleep', 2600], ['pick', 'gholdengo'], ['sleep', 1550], ['shot', 'during']], wait: 3000 },
  { name: '07-fixed-race-with-abort', page: 'fixed', query: '?cancel=1', steps: [['pick', 'eevee'], ['sleep', 2600], ['pick', 'gholdengo']], wait: 5000 },
  { name: '08-failure-species', page: 'fixed', query: '?fail=species', steps: [['pick', 'eevee']], wait: 4800 },
  { name: '09-failure-404-first-request', page: 'fixed', steps: [['search', 'pikachuu']], wait: 3000 },
];

const profile = join(tmpdir(), 'pokedex-race-chrome');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 1;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else listeners.forEach((fn) => fn(msg));
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
});
const js = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true });

await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });

mkdirSync(OUT, { recursive: true });

async function screenshot(file) {
  // let sprites finish loading so the picture matches what a user would see
  await js(`Promise.race([Promise.all([...document.images].map((i) => i.complete || new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 3000))])`);
  const size = await js(`JSON.stringify({ x: 0, y: 0, width: 1280, height: document.documentElement.scrollHeight, scale: 1 })`);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: JSON.parse(size.result.result.value) });
  writeFileSync(join(OUT, `${file}.png`), Buffer.from(shot.result.data, 'base64'));
}
const summary = [];

const only = process.argv.slice(2);
for (const sc of scenarios.filter((s) => !only.length || only.some((o) => s.name.startsWith(o)))) {
  await send('Page.navigate', { url: `${SITE}/${sc.page}.html${sc.query || ''}` });
  await sleep(1200);

  const reqs = new Map();
  let base = null;
  const onMsg = (m) => {
    const p = m.params || {};
    if (m.method === 'Network.requestWillBeSent' && p.request.url.includes('/api/pokeapi/v2/')) {
      base ??= p.timestamp;
      reqs.set(p.requestId, { path: p.request.url.split('/api/pokeapi/v2')[1], start: p.timestamp, end: null, status: '' });
    } else if (m.method === 'Network.responseReceived' && reqs.has(p.requestId)) {
      reqs.get(p.requestId).status = p.response.status;
    } else if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) {
      reqs.get(p.requestId).end = p.timestamp;
    } else if (m.method === 'Network.loadingFailed' && reqs.has(p.requestId)) {
      const r = reqs.get(p.requestId); r.end = p.timestamp; r.status = p.canceled ? '(canceled)' : p.errorText;
    }
  };
  listeners.push(onMsg);

  for (const [kind, arg] of sc.steps) {
    if (kind === 'sleep') await sleep(arg);
    if (kind === 'pick') await js(`document.querySelector('[data-pick="${arg}"]').click()`);
    if (kind === 'shot') await screenshot(`${sc.name}-${arg}`);
    if (kind === 'search') await js(`(() => { const f = document.querySelector('#search'); f.q.value = '${arg}'; f.requestSubmit(); })()`);
  }
  await sleep(sc.wait);
  listeners.splice(listeners.indexOf(onMsg), 1);

  await screenshot(sc.name);

  const panel = await js(`JSON.stringify([...document.querySelectorAll('.section')].map(s => ({
    section: s.id, text: s.querySelector('.body').innerText.slice(0, 90).replace(/\\s+/g,' ') })))`);
  const network = [...reqs.values()].map((r) => ({
    path: r.path, status: r.status,
    startMs: Math.round((r.start - base) * 1000),
    endMs: r.end ? Math.round((r.end - base) * 1000) : null,
    durationMs: r.end ? Math.round((r.end - r.start) * 1000) : null,
  }));
  const raceView = await js(`JSON.stringify([...document.querySelectorAll('#waterfall .wf-row')].map(r => r.innerText.replace(/\\s+/g,' ')))`);
  const result = { scenario: sc.name, page: sc.page + '.html' + (sc.query || ''), steps: sc.steps, network, finalScreen: JSON.parse(panel.result.result.value), raceView: JSON.parse(raceView.result.result.value) };
  writeFileSync(join(OUT, `${sc.name}.json`), JSON.stringify(result, null, 2));
  summary.push(result);
  console.log(`\n== ${sc.name} (${sc.page})`);
  for (const n of network) console.log(`  ${String(n.startMs).padStart(5)} → ${String(n.endMs).padStart(5)} ms  ${String(n.status).padEnd(10)} ${n.path}`);
  for (const s of result.finalScreen) console.log(`  [${s.section}] ${s.text}`);
  for (const r of result.raceView) console.log(`  race: ${r}`);
}

if (!only.length) writeFileSync(join(OUT, 'all-scenarios.json'), JSON.stringify(summary, null, 2));
ws.close();
chrome.kill();
