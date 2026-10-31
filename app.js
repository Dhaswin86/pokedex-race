/* The app: one Pokédex page that can run in BROKEN or FIXED mode.
   The request plan (loader.js) and drawing (common.js) are shared; the only thing the
   switch changes is which `apply` guard decides if an answer may touch the page. */

import { timeline, clearCard, forgetPick } from './common.js?v=6';
import { wireUI, options } from './loader.js?v=6';
import { createBroken } from './broken.js?v=6';
import { createFixed } from './fixed.js?v=6';

const MODES = {
  broken: { create: createBroken, note: 'Draws every answer as soon as it arrives, even after you have picked another Pokémon.' },
  fixed: { create: createFixed, note: 'Gives each click a ticket number and ignores answers from older tickets.' },
};

let modeName = options.get('mode') === 'fixed' ? 'fixed' : 'broken';
let mode = MODES[modeName].create();

function showMode() {
  document.documentElement.dataset.mode = modeName;
  document.title = `Pokédex — ${modeName}`;
  document.querySelector('#mode-note').textContent = MODES[modeName].note;
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === modeName)));
}

function switchMode(name) {
  if (name === modeName) return;
  mode.retire(); // answers still on their way from the old mode must not touch the page
  modeName = name;
  mode = MODES[name].create();

  const url = new URL(location.href);
  url.searchParams.set('mode', name);
  history.replaceState(null, '', url);

  timeline.reset();
  clearCard();
  forgetPick();
  document.querySelector('#header .body').innerHTML = '<p class="muted">Pick a Pokémon above.</p>';
  for (const id of ['species', 'types', 'evolution', 'item', 'where']) document.querySelector(`#${id} .body`).innerHTML = '';
  document.querySelectorAll('[data-pick]').forEach((b) => b.classList.remove('active'));
  showMode();
}

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
showMode();
wireUI((query, failSpecies, lag) => mode.select(query, failSpecies, lag));
