/* The request plan for one selection. Shared by both versions.
   `apply(sel, path, render)` is passed in by broken.js / fixed.js — it decides whether a
   response that just arrived is allowed to touch the page. That is the whole difference. */

import {
  fetchJSON, clearCard, showSelected, showError, timeline, evolutionItem,
  renderHeader, renderSpecies, renderTypes, renderEvolution, renderItem, renderNoItem,
  renderLocation, renderNotWild,
} from './common.js?v=3';

const idFromUrl = (url) => url.split('/').filter(Boolean).pop();
const isAbort = (err) => err.name === 'AbortError';

export async function loadPokemon(sel, query, { apply, signal, failSpecies }) {
  clearCard();
  showSelected(sel);

  // REQUEST 1 — level 1, needs nothing. Everything else waits for it,
  // because every later request takes a value out of this answer.
  const p1 = `/pokemon/${query}`;
  let pokemon;
  try {
    pokemon = await fetchJSON(p1, sel, signal);
  } catch (err) {
    if (isAbort(err)) return;
    apply(sel, p1, () => {
      showError('header', sel, err);
      for (const s of ['species', 'types', 'evolution', 'item', 'where']) {
        showError(s, sel, new Error('not started — the first request failed, so there is no name to ask for'));
      }
    });
    return;
  }
  if (!apply(sel, p1, () => renderHeader(pokemon, sel))) return;

  // REQUESTS 2 + 3 (+ encounters) — level 2. They each need only the level-1 answer,
  // not each other, so they start together and nobody waits for anybody.
  speciesBranch(sel, pokemon, { apply, signal, failSpecies });
  typesBranch(sel, pokemon, { apply, signal });
  whereBranch(sel, pokemon, { apply, signal });
}

/* species (L2) → evolution-chain (L3, needs the id inside species) → item (L4, needs the chain) */
async function speciesBranch(sel, pokemon, { apply, signal, failSpecies }) {
  let path = `/pokemon-species/${pokemon.species.name}${failSpecies ? '-broken' : ''}`;
  try {
    const species = await fetchJSON(path, sel, signal);
    if (!apply(sel, path, () => renderSpecies(species, sel))) return;

    path = `/evolution-chain/${idFromUrl(species.evolution_chain.url)}`;
    const chain = await fetchJSON(path, sel, signal);
    if (!apply(sel, path, () => renderEvolution(chain, sel))) return;

    const itemName = evolutionItem(chain);
    if (!itemName) { apply(sel, path, () => renderNoItem(sel)); return; }

    path = `/item/${itemName}`;
    const item = await fetchJSON(path, sel, signal);
    apply(sel, path, () => renderItem(item, sel));
  } catch (err) {
    if (isAbort(err)) return;
    // A failure only blanks THIS branch (and the steps that needed it); the others keep going.
    apply(sel, path, () => {
      showError(path.startsWith('/item') ? 'item' : 'species', sel, err);
      if (path.startsWith('/pokemon-species')) {
        showError('evolution', sel, new Error('not started — it needs the species answer'));
        showError('item', sel, new Error('not started — it needs the evolution chain'));
      }
    });
  }
}

/* one /type/{name} per type, all at once; the matchup needs every type, so wait for all of them */
async function typesBranch(sel, pokemon, { apply, signal }) {
  const paths = pokemon.types.map((t) => `/type/${t.type.name}`);
  try {
    const types = await Promise.all(paths.map((p) => fetchJSON(p, sel, signal)));
    let shown = true;
    for (const p of paths) shown = apply(sel, p, () => {}) && shown;
    if (shown) renderTypes(types, sel);
  } catch (err) {
    if (isAbort(err)) return;
    apply(sel, paths[0], () => showError('types', sel, err));
  }
}

/* encounters (L2) → location-area (L3, needs the area name) → location (L4, needs the location name) */
async function whereBranch(sel, pokemon, { apply, signal }) {
  let path = `/pokemon/${pokemon.id}/encounters`;
  try {
    const encounters = await fetchJSON(path, sel, signal);
    if (!encounters.length) { apply(sel, path, () => renderNotWild(sel)); return; }
    if (!apply(sel, path, () => {})) return;

    path = `/location-area/${encounters[0].location_area.name}`;
    const area = await fetchJSON(path, sel, signal);
    if (!apply(sel, path, () => {})) return;

    path = `/location/${area.location.name}`;
    const location = await fetchJSON(path, sel, signal);
    apply(sel, path, () => renderLocation(area, location, sel));
  } catch (err) {
    if (isAbort(err)) return;
    apply(sel, path, () => showError('where', sel, err));
  }
}

/* ---------- Buttons ---------- */

/* Test switches live in the URL so the page itself stays a plain app:
   ?fail=species  → the species request asks for a name that does not exist (failure demo)
   ?cancel=1      → fixed version also aborts old requests (shown as "(canceled)" in Network) */
export const options = new URLSearchParams(location.search);

export function wireUI(select) {
  const failSpecies = options.get('fail') === 'species';
  const go = (q) => select(String(q).trim().toLowerCase(), failSpecies);

  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => go(b.dataset.pick)));
  document.querySelector('#search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value;
    if (q.trim()) go(q);
  });

  document.querySelector('#clear-log')?.addEventListener('click', () => timeline.reset());

  // Hidden shortcut for the demo: press R to pick Eevee (slow) and then Gholdengo (fast) 50 ms later.
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'r' || e.target.matches('input')) return;
    timeline.reset();
    go('eevee');
    setTimeout(() => go('gholdengo'), 50);
  });
}
