/* Shared by broken.html and fixed.html.
   Everything here is identical in both versions: fetching, logging and drawing.
   The ONLY difference between the two versions is in broken.js / fixed.js. */

export const HUB = 'https://api-hub-50046202742.development.catalystappsail.in/api/pokeapi';
const API = HUB + '/v2';

// ?slow=1 pretends to be on a slow phone network: every request waits an extra 1.5 s
// before it is sent. The race window grows from ~0.3 s to ~2 s, so the stale-response
// bug can be seen by clicking the buttons by hand.
const SLOW_MS = new URLSearchParams(location.search).get('slow') === '1' ? 1500 : 0;

const $ = (sel) => document.querySelector(sel);
const pretty = (s) => (s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const idFromUrl = (url) => url.split('/').filter(Boolean).pop();

/* ---------- Request log + waterfall (in-page "Network panel") ---------- */

const rows = [];
let t0 = null;
const now = () => Math.round(performance.now() - t0);

export const timeline = {
  reset() { rows.length = 0; t0 = performance.now(); draw(); },
  start(sel, path) {
    if (t0 === null) t0 = performance.now();
    const row = { sel, path, start: now(), end: null, status: '…', outcome: 'pending' };
    rows.push(row); draw();
    return row;
  },
  mark(sel, path, outcome) {
    const row = [...rows].reverse().find((r) => r.sel.id === sel.id && r.path === path);
    if (!row) return;
    if (row.outcome === 'failed' || row.outcome.startsWith('failed-')) {
      row.outcome = { ignored: 'failed-ignored', 'stale-applied': 'failed-stale' }[outcome] || 'failed';
    } else {
      row.outcome = outcome;
    }
    draw();
  },
};

/** fetch() wrapper: logs start/end, throws a readable error on a non-2xx answer. */
export async function fetchJSON(path, sel, signal) {
  const row = timeline.start(sel, path);
  try {
    const wait = SLOW_MS + (sel.lag || 0); // sel.lag: the Race test puts the first pick on a slow network
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(API + path, { signal });
    row.end = now(); row.status = res.status; draw();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`${res.status} — ${body.error?.message || res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    if (row.end === null) { row.end = now(); row.status = err.name === 'AbortError' ? 'cancelled' : 'network error'; }
    row.outcome = err.name === 'AbortError' ? 'cancelled' : 'failed';
    draw();
    throw err;
  }
}

const OUTCOME_TEXT = {
  pending: 'waiting…',
  applied: 'shown',
  'stale-applied': '⚠ SHOWN, but user had moved on',
  ignored: 'ignored (stale)',
  failed: 'failed → error shown',
  'failed-ignored': 'failed, ignored (stale)',
  'failed-stale': '⚠ old ERROR shown on new selection',
  cancelled: 'cancelled',
};

// The Race view keeps one DOM row per request and updates it in place, so bars can grow
// smoothly frame by frame instead of the whole list being rebuilt.
function draw() {
  const box = $('#waterfall');
  if (!box) return;
  if (!rows.length) { box.replaceChildren(); return; }
  const max = Math.max(4000, ...rows.map((r) => r.end ?? now()));
  for (const r of rows) {
    if (!r.el) {
      r.el = document.createElement('div');
      r.el.innerHTML = `
        <span class="wf-sel sel-${r.sel.id % 4}">#${r.sel.id} ${r.sel.name}${r.sel.lag ? ' 🐢' : ''}</span>
        <span class="wf-path" title="${r.path}">${r.path}</span>
        <span class="wf-track"><span class="wf-bar sel-${r.sel.id % 4}"></span></span>
        <span class="wf-time"></span><span class="wf-status"></span><span class="wf-outcome"></span>`;
      box.append(r.el);
    }
    r.el.className = `wf-row out-${r.outcome}`;
    const bar = r.el.querySelector('.wf-bar');
    bar.style.left = `${(r.start / max) * 100}%`;
    bar.style.width = `${Math.max(0.6, (((r.end ?? now()) - r.start) / max) * 100)}%`;
    r.el.querySelector('.wf-time').textContent = `${r.start}→${r.end ?? '…'} ms`;
    r.el.querySelector('.wf-status').textContent = r.status;
    r.el.querySelector('.wf-outcome').textContent = OUTCOME_TEXT[r.outcome];
  }
}
(function tick() {
  if (rows.some((r) => r.end === null)) draw();
  requestAnimationFrame(tick);
})();

/* ---------- Card sections ---------- */

// Which selection the user picked last. Every panel is labelled with the selection its data
// came from, so data from an older click stands out in red.
let picked = null;

function fill(section, sel, html) {
  const el = $(`#${section}`);
  el.classList.remove('loading', 'error');
  let tag = el.querySelector('h3 .from');
  if (!tag) { tag = document.createElement('span'); tag.className = 'from'; el.querySelector('h3').append(tag); }
  tag.textContent = pretty(sel.name);
  el.classList.toggle('stale', !!picked && sel.name !== picked.name);
  showVerdict();
  const body = el.querySelector('.body');
  body.innerHTML = html;
  body.classList.remove('reveal');
  void body.offsetWidth; // restart the fade-in when a panel is filled again
  body.classList.add('reveal');
}

// Sprites fade in once they have actually loaded, instead of popping in.
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('loaded'); }, true);

/** Highlights the button of what the user picked last (nothing for a typed search). */
export function showSelected(sel) {
  picked = sel;
  document.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('active', b.dataset.pick === sel.name));
}

export function clearCard() {
  for (const el of document.querySelectorAll('.section')) {
    el.classList.remove('error', 'stale');
    el.classList.add('loading');
    el.querySelector('h3 .from')?.remove();
    el.querySelector('.body').innerHTML = '<div class="skeleton"></div><div class="skeleton short"></div>';
  }
  showVerdict();
}

/** Mode switch: nothing is picked any more. */
export function forgetPick() { picked = null; showVerdict(); }

/** The banner above the card: does everything on screen belong to what the user picked? */
function showVerdict() {
  const box = $('#verdict');
  if (!box) return;
  const shown = [...document.querySelectorAll('.section h3 .from')];
  const wrong = shown.filter((t) => t.closest('.section').classList.contains('stale'));
  if (!picked || !shown.length) { box.className = 'verdict'; box.textContent = picked ? `Loading ${pretty(picked.name)}…` : ''; return; }
  if (wrong.length) {
    const from = [...new Set(wrong.map((t) => t.textContent))].join(', ');
    box.className = 'verdict bad';
    box.textContent = `⚠ Wrong Pokémon: you picked ${pretty(picked.name)}, but ${wrong.length} of ${shown.length} panels show ${from}.`;
  } else {
    box.className = 'verdict good';
    box.textContent = `✓ Correct: all ${shown.length} panels shown belong to ${pretty(picked.name)}.`;
  }
}

export function showError(section, sel, err) {
  fill(section, sel, `<p class="err">Could not load this part: ${err.message}</p>`);
  $(`#${section}`).classList.add('error');
}

export function renderHeader(p, sel) {
  const stats = p.stats.map((s) => `
    <div class="stat"><span>${pretty(s.stat.name)}</span>
      <span class="bar"><i style="width:${Math.min(100, s.base_stat / 1.6)}%"></i></span><b>${s.base_stat}</b></div>`).join('');
  fill('header', sel, `
    <div class="hero">
      <img src="${HUB}/sprite/${p.id}.png" alt="${p.name}" width="140" height="140">
      <div>
        <h2>${pretty(p.name)} <small>#${p.id}</small></h2>
        <p>${p.types.map((t) => `<span class="chip t-${t.type.name}">${t.type.name}</span>`).join(' ')}</p>
        <p class="muted">${p.height / 10} m · ${p.weight / 10} kg</p>
      </div>
    </div>
    <div class="stats">${stats}</div>`);
}

export function renderSpecies(s, sel) {
  const en = (list, key) => list.find((x) => x.language.name === 'en')?.[key] || '';
  fill('species', sel, `
    <p><b>${en(s.genera, 'genus')}</b> · ${pretty(s.generation.name)} · habitat: ${s.habitat ? pretty(s.habitat.name) : 'unknown'}</p>
    <p class="flavor">“${en(s.flavor_text_entries, 'flavor_text').replace(/[\f\n]/g, ' ')}”</p>`);
}

/** Combines the damage relations of all the Pokémon's types into one multiplier per attacking type. */
export function renderTypes(types, sel) {
  const mult = {};
  for (const t of types) {
    const r = t.damage_relations;
    r.double_damage_from.forEach((x) => (mult[x.name] = (mult[x.name] ?? 1) * 2));
    r.half_damage_from.forEach((x) => (mult[x.name] = (mult[x.name] ?? 1) * 0.5));
    r.no_damage_from.forEach((x) => (mult[x.name] = 0));
  }
  const list = (test) => Object.entries(mult).filter(([, m]) => test(m))
    .map(([n, m]) => `<span class="chip t-${n}">${n} ×${m}</span>`).join(' ') || '<span class="muted">none</span>';
  fill('types', sel, `
    <p><b>Weak to</b> ${list((m) => m > 1)}</p>
    <p><b>Resists</b> ${list((m) => m > 0 && m < 1)}</p>
    <p><b>Immune to</b> ${list((m) => m === 0)}</p>`);
}

/** Walks the evolution tree. Returns the first evolution item it finds (or null). */
export function evolutionItem(chain) {
  const stack = [chain.chain];
  while (stack.length) {
    const node = stack.shift();
    const d = node.evolution_details.find((e) => e.item);
    if (d) return d.item.name;
    stack.push(...node.evolves_to);
  }
  return null;
}

export function renderEvolution(chain, sel) {
  const stages = [];
  const walk = (node, depth) => { (stages[depth] ||= []).push(node.species); node.evolves_to.forEach((c) => walk(c, depth + 1)); };
  walk(chain.chain, 0);
  fill('evolution', sel, `<div class="evo">${stages.map((stage) =>
    `<div class="stage">${stage.map((sp) => `<figure><img src="${HUB}/sprite/${idFromUrl(sp.url)}.png" alt="" width="56" height="56"><figcaption>${pretty(sp.name)}</figcaption></figure>`).join('')}</div>`
  ).join('<span class="arrow">→</span>')}</div>`);
}

export function renderItem(item, sel) {
  const effect = item.effect_entries.find((e) => e.language.name === 'en')?.short_effect || '';
  fill('item', sel, `
    <div class="item"><img src="${HUB}/item-sprite/${item.name}.png" alt="" width="40" height="40">
      <div><b>${pretty(item.name)}</b><p class="muted">${effect}</p></div></div>`);
}

export function renderNoItem(sel) {
  fill('item', sel, '<p class="muted">No evolution item needed.</p>');
}

export function renderLocation(area, location, sel) {
  const areaName = area.names.find((n) => n.language.name === 'en')?.name || pretty(area.name);
  fill('where', sel, `<p>Found at <b>${areaName}</b>, ${pretty(location.name)} — <b>${pretty(location.region?.name || 'unknown region')}</b> region</p>`);
}

export function renderNotWild(sel) {
  fill('where', sel, '<p class="muted">Not found in the wild in any game.</p>');
}
