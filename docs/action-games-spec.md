# Action mini-games ("Безумцы"-style) — spec

Real-time party mini-games in the spirit of Sony PlayLink *Frantics*: the host laptop renders the
game on the big screen, every phone is a controller. Up to ~10 players at once.

## Constraints
- Phone ↔ host messages go over MQTT (see `mqttBus` in `index.html`), latency 100–500 ms and jittery.
  Games must be forgiving: momentum/physics, big hitboxes, no frame-precise timing.
- The host owns all game state and simulation. Phones only send input and show their status.
- Vanilla JS, no build step, no new CDNs. Each game is its own file `games/<id>.js`.
- All on-screen text in Russian, short, big. First round must be self-explanatory (one-line rules).

## Files
- `index.html` — engine (host side), phone controller screen, integration with the mini-game vote.
- `games/<id>.js` — one game each, loaded by `<script src="games/<id>.js">` in `index.html` **before** the main inline script.

## Game module contract
Each file does:

```js
(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"sumo",                 // unique, matches file name
  title:"Ледяной сумо",      // shown in the vote and on screen
  rules:"Сталкивай всех с льдины. Последний на льдине — победитель.", // one line, shown on screen + phones
  controls:"stick",          // "stick" (joystick only), "stick+btn" (joystick + one action button), "tap" (big tap button only)
  btnLabel:"Рывок",          // label of the action button when controls==="stick+btn"
  duration:60,               // hard cap in seconds; engine calls finish() with current standings when it runs out
  init(ctx){},               // set up world; ctx.players already filled
  update(ctx,dt){},          // fixed step, dt = 1/60 s
  draw(ctx,g){},             // g = CanvasRenderingContext2D already scaled to world units (ctx.W x ctx.H)
  standings(ctx){},          // OPTIONAL: return players best → worst; used when the round ends by timeout or by the
                             // admin's "Дальше" (e.g. sumo ranks survivors by distance to the centre). Partial lists are
                             // completed with the default order (see ctx.finish).
});
```

Notes (as implemented in `index.html`):
- `draw` is also called during the ~5 s intro (behind a dark overlay) and while the "Финиш!" banner shows, so `init`
  must leave the world drawable. Each `draw` call is wrapped in `save()/restore()` and clipped to the world rect.
- The engine draws the remaining-time pill at the top centre; keep your own HUD out of the top-centre ~150×70 area.
- Exceptions thrown by `update` end the round with current standings; exceptions in `init`/`draw` are logged.
- To add a game: create `games/<id>.js` and add `<script src="games/<id>.js"></script>` next to the sumo one in
  `index.html` (before the main inline script). It then shows up in the vote automatically.

### `ctx` provided by the engine
- `ctx.W = 1600`, `ctx.H = 900` — world size in units; the canvas is letterboxed/scaled to fit the screen.
- `ctx.players` — array of `{name, color, idx, input, alive, data}`:
  - `input = {x, y, btn, taps}` — joystick vector in [-1,1] (y down is positive, length ≤ 1), `btn` true while held,
    `taps` an integer counter incremented on each press of the tap button **or** the action button (diff it yourself
    per frame — more reliable than watching `btn`, since a short press can start and end between two messages).
    If no input message arrives for 1.5 s, the engine zeroes `x`, `y`, `btn`.
  - `color` — one of 10 distinct colours, `idx` — index in `ctx.players` (order = join order).
  - `alive` — engine sets true at start; game sets false via `ctx.eliminate(p)`.
  - `data` — free object for the game's per-player state (position, velocity…).
- `ctx.t` — seconds since the round started (after the 3-2-1 countdown).
- `ctx.rand()` — Math.random.
- `ctx.eliminate(p)` — mark player out (records elimination order; phone shows "Ты выбыл").
- `ctx.finish(order)` — end the round. `order` = array of players best → worst. If omitted, engine ranks
  alive players first (in array order) then eliminated players in reverse elimination order.
- `ctx.banner(text, seconds=1.5)` — big overlay text on screen (e.g. "Льдина тает!").
- `ctx.drawPlayer(g, p, x, y, r)` — standard avatar: filled circle in `p.color` with the name label; use it so all games look consistent.

Scoring (engine): place 1 → 500, 2 → 300, 3 → 150, everyone else who played → 50. Added to the shared leaderboard.

## Network protocol (engine)
- phone → host: `{t:"in", x, y, b, k}` (k = press counter), QoS 0 (`mqttBus().pub(topic, w, qos)` takes an optional QoS).
  Sent immediately on touch/press/release (then repeated for 300 ms in case one is dropped), every ~80 ms (~12 Hz)
  while the value changes, and as a 400 ms heartbeat while the stick or button is held still.
- host → phone: `{t:"pad", ph, game, title, rules, controls, btnLabel, color, place, gain, score}`
  with `ph` ∈ `"intro"` (rules + countdown), `"play"`, `"out"` (eliminated, still watching), `"res"` (round result).
  Extra fields: `round` (round id, changes every round), `left` (seconds until start, intro only), `n` (players in round).
  Players not in the round get `{t:"idle"}` ("сыграешь в следующем раунде").
  A phone that rejoins mid-round must get the current `pad` state again.

## Engine responsibilities (host)
- Integrates with the existing arena/vote: action games appear in the "Во что играем дальше?" vote like other games.
- Intro screen (title, rules, controls, player colors) ~5 s with 3-2-1, then play, then results screen (places, +points), then back to arena idle.
- Players present = players with an open connection at round start. Late joiners watch until next round.
- Admin "Дальше"/"Прервать игру" must work during action games too. "Дальше": intro → start now; play → finish with
  current standings; finish banner/results → next. "Прервать игру": back to arena idle, no points.
- Points are guarded by the shared `scored` set (`"act"+round`), so they are never added twice.
- Distinct colors for up to 10 players.

## Phone controller (player side)
- Screen `pPad`: title + one-line rules, player color swatch, virtual joystick (touch, large, left/center), optional action button, or one big tap button for "tap" games.
- No page scrolling/zoom while playing (`touch-action:none`), works with one thumb.
- Shows "Ты выбыл — смотри на экран" when out, and result screen at the end.
