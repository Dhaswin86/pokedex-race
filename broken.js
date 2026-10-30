/* BROKEN VERSION — shows whatever comes back, whenever it comes back. */

import { timeline } from './common.js?v=3';
import { loadPokemon, wireUI } from './loader.js?v=3';

let latestId = 0; // only used to LABEL the log; it never stops anything

function apply(sel, path, render) {
  render(); // no check: an old answer can paint over the newer selection
  timeline.mark(sel, path, sel.id === latestId ? 'applied' : 'stale-applied');
  return true;
}

function select(query, failSpecies) {
  const sel = { id: ++latestId, name: query };
  loadPokemon(sel, query, { apply, failSpecies });
}

wireUI(select);
