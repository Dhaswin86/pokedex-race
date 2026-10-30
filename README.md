# Pokédex Race

A small Pokédex built on the API Hub's Pokémon service to show what happens when async responses arrive out of order.

- **broken.html**: draws every response as soon as it arrives, so a slow response for an earlier click can overwrite the newer selection (a stale-response race condition).
- **fixed.html**: each click gets a ticket number (`sel.id`); `apply()` in `fixed.js` ignores any response whose ticket is not the newest and stops that request chain.

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
- `fixed.html?cancel=1` also aborts old requests (shown as `(canceled)` in DevTools → Network).
- `?fail=species` makes the species request 404 to show partial failure.

The **Race view** under the card lists every request, its timing, and whether the page showed or ignored its answer.

## Run locally

```bash
python3 tools/serve.py 8820
```

Then open http://localhost:8820/. The pages use ES modules, so they must be served over HTTP.
