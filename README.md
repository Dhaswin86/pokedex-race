# Pokédex Race

A small Pokédex built on the API Hub's Pokémon service to show what happens when async responses arrive out of order.

One page (`index.html`) with a **Broken / Fixed** switch in the header:

- **Broken** (`broken.js`): draws every response as soon as it arrives, so a slow response for an earlier click can overwrite the newer selection (a stale-response race condition).
- **Fixed** (`fixed.js`): each click gets a ticket number (`sel.id`); `apply()` ignores any response whose ticket is not the newest and stops that request chain.

`app.js` wires the switch; `loader.js` (request plan) and `common.js` (fetching and drawing) are shared by both modes.
`?mode=fixed` opens straight in Fixed mode; the old `broken.html` / `fixed.html` addresses redirect to the matching mode.

## Request plan per selection

```
pokemon/{name}                                  waits for nothing
├─ pokemon-species → evolution-chain → item     each step waits for the one before
├─ type/{name} (one per type, run together)
└─ encounters → location-area → location
```

The three branches run in parallel after the first request.

## Try it

- Click an empty part of the page and press **R**: Eevee, then Gholdengo 50 ms later.
- `?slow=1` adds 1.5 s before every request so the race can be triggered by clicking.
- `?mode=fixed&cancel=1` also aborts old requests (shown as `(canceled)` in DevTools → Network).
- `?fail=species` makes the species request 404 to show partial failure.

The **Race view** under the card lists every request, its timing, and whether the page showed or ignored its answer.

## Run locally

```bash
python3 tools/serve.py 8820
```

Then open http://localhost:8820/. The pages use ES modules, so they must be served over HTTP.

Live: https://dhaswin86.github.io/pokedex-race/
