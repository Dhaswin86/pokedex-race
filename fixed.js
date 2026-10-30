/* FIXED MODE — everything on screen must belong to the most recent selection. */

import { timeline } from './common.js?v=4';
import { loadPokemon, options } from './loader.js?v=4';

export function createFixed() {
  // Every click gets a new ticket number. Only the newest ticket may change the page.
  let currentId = 0;
  let controller = null;

  // ===== THE STALE GUARD =====
  // Every response goes through here before it may touch the page.
  // `sel.id` is the ticket the request was started with; `currentId` is the newest ticket.
  // If they differ, the user has picked something else since, so the answer is thrown away
  // AND `false` stops that branch, so its next requests are never even sent.
  function apply(sel, path, render) {
    if (sel.id !== currentId) {
      timeline.mark(sel, path, 'ignored');
      return false;
    }
    render();
    timeline.mark(sel, path, 'applied');
    return true;
  }

  return {
    select(query, failSpecies) {
      const sel = { id: ++currentId, name: query }; // new ticket → every older ticket is now stale

      // Optional extra: cancel the old requests still on the network (shown as "cancelled").
      // The guard above is what guarantees correctness; this only saves bandwidth.
      if (options.get('cancel') === '1') controller?.abort();
      controller = new AbortController();

      loadPokemon(sel, query, { apply, failSpecies, signal: controller.signal });
    },
    // Switching to the other mode: a new ticket makes every answer still on its way stale.
    retire() { currentId++; },
  };
}
