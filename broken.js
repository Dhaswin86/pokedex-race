/* BROKEN MODE — shows whatever comes back, whenever it comes back. */

import { timeline } from './common.js?v=6';
import { loadPokemon } from './loader.js?v=6';

export function createBroken() {
  let latestId = 0; // only used to LABEL the Race view; it never stops anything
  let retired = false; // set when the user switches to the other mode

  function apply(sel, path, render) {
    if (retired) return false;
    render(); // no check: an old answer can paint over the newer selection
    timeline.mark(sel, path, sel.id === latestId ? 'applied' : 'stale-applied');
    return true;
  }

  return {
    select(query, failSpecies, lag) {
      const sel = { id: ++latestId, name: query, lag };
      loadPokemon(sel, query, { apply, failSpecies });
    },
    retire() { retired = true; },
  };
}
