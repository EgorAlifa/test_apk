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
});
```

### `ctx` provided by the engine
- `ctx.W = 1600`, `ctx.H = 900` — world size in units; the canvas is letterboxed/scaled to fit the screen.
- `ctx.players` — array of `{name, color, idx, input, alive, data}`:
  - `input = {x, y, btn, taps}` — joystick vector in [-1,1] (y down is positive), `btn` true while held,
    `taps` an integer counter incremented on each tap (for "tap" games; diff it yourself per frame).
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
- phone → host: `{t:"in", x, y, b, k}` (k = tap counter), sent while touching at ~12 Hz and immediately on change/release; QoS 0.
- host → phone: `{t:"pad", ph, game, title, rules, controls, btnLabel, color, place, gain, score}`
  with `ph` ∈ `"intro"` (rules + countdown), `"play"`, `"out"` (eliminated, still watching), `"res"` (round result).
  A phone that rejoins mid-round must get the current `pad` state again.

## Engine responsibilities (host)
- Integrates with the existing arena/vote: action games appear in the "Во что играем дальше?" vote like other games.
- Intro screen (title, rules, controls, player colors) ~5 s with 3-2-1, then play, then results screen (places, +points), then back to arena idle.
- Players present = players with an open connection at round start. Late joiners watch until next round.
- Admin "Дальше"/"Прервать игру" must work during action games too.
- Distinct colors for up to 10 players.

## Phone controller (player side)
- Screen `pPad`: title + one-line rules, player color swatch, virtual joystick (touch, large, left/center), optional action button, or one big tap button for "tap" games.
- No page scrolling/zoom while playing (`touch-action:none`), works with one thumb.
- Shows "Ты выбыл — смотри на экран" when out, and result screen at the end.
