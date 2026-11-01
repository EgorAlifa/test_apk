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
  hud:"alive",               // OPTIONAL: the phone HUD shows "<aliveLabel> 4/6" (elimination games) instead of the live
                             // place "2-й из 6" (default when standings() exists; games without standings show alive too)
  aliveLabel:"На льдине",    // OPTIONAL: label for the alive count (default "В игре")
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
- `ctx.status(p, text, opts)` — game-driven status line on that player's phone (e.g. «БОМБА У ТЕБЯ! 5 с», «Монет: 7»).
  `opts = {color: "red"|"green"|"gold"|null, vibrate: ms}`; `text` `""`/`null` clears it (≤ 60 chars).
  Call it every frame if you like: the engine stores the latest value per player and sends it to the phone only when
  text/colour changed, at most every 250 ms. `vibrate` is applied only when the text/colour actually changes (so a
  status you re-set every frame does not buzz repeatedly). Works during intro and play; ignored for anything that is not
  in `ctx.players` (e.g. robots). The engine clears it on `ctx.eliminate(p)` and when the round finishes.
  The phone shows it as a big line under the rules; `color` tints the line and the screen edge.
- `ctx.ack(p)` — "this press did something" (dash/jump actually happened). The phone flashes the action button and
  vibrates only on this confirmation, and the big screen draws a short pulse ring at the avatar (`p.data.x/y`, lifted by
  `p.data.z` if set). Games that never call it get the confirmation as soon as the engine has processed the press
  counter, and the pulse on every button press. Call it once per real action (sumo/coins/bomb/tiles do).
- `ctx.cooldown(p, left, total)` — seconds until the action is ready again and the full cooldown length; call it every
  frame (e.g. right after `d.cd-=dt`). The phone draws the real host-side cooldown sweep/ring on the action button and
  animates it locally between updates. If a game stops calling it for a player (fell, eliminated) it counts as ready.
- `ctx.pulse(p)` — the pulse ring alone, for any other "it landed" moment.
- `ctx.drawPlayer(g, p, x, y, r)` — standard avatar: filled circle in `p.color` with the name label; use it so all games look consistent.

Scoring (engine): place 1 → 500, 2 → 300, 3 → 150, everyone else who played → 50. Added to the shared leaderboard.
For balance, the other sources of points: video quiz 125–250 per correct answer (125 + 125 × speed), «Быстрый палец»
200/100/50 per round (3 rounds), «Кто из нас?» +300 to the majority. Equal scores on places 1–3 of a podium are settled by a
«Перестрелка» (one tap-reaction round for the tied players), which only orders them and adds no points.

## Network protocol (engine)
Budget: public brokers drop clients that publish tens of messages per second, so every client stays under 4 msgs/s
(per-transport token buckets, everything MQTT QoS 0; lost screen messages are healed by the `sv` heartbeat + `{t:"sync"}`, see local-mode-spec.md). Topics: phone → host `aeshow/<id>/h`; host → one
phone `aeshow/<id>/p/<cid>`; host → every phone `aeshow/<id>/all` (phones act on it only after the host welcomed them).
- phone → host: `{t:"in", x, y, b, k, s}` (k = press counter, s = message sequence number, echoed in the HUD), latest wins.
  Only when something changed (stick quantised to 24 directions × 4 steps), at most 4/s; a held stick/button is repeated
  every 1 s, an unconfirmed press every 0.4 s, and the last change once more after 0.3 s. The host zeroes an input that
  has not been refreshed for 2.5 s.
- host → phone: `{t:"pad", ph, game, title, rules, controls, btnLabel, color, place, gain, score, st, sc, ix, vb, sv}`,
  only on phase changes: `ph` ∈ `"intro"` (rules + countdown), `"play"`, `"out"` (eliminated, still watching), `"res"`
  (round result), and the full state again when a phone rejoins mid-round.
  Extra fields: `round` (round id), `left` (seconds until start, intro only), `n` (players in round), `st`/`sc` (current
  `ctx.status`), `ix` (this player's index in the HUD array), `vb` (vibration counter, see below), `dur` (round length),
  `hm` (`"place"`|`"alive"`), `hl` (alive label) and `hud` (this player's current HUD, during play/out).
- host → all phones during play: ONE `{t:"hud", round, tx, al, n, P:[…]}` message on the shared topic (latest wins).
  `tx` seconds left (phones count down locally), `al`/`n` alive / players; `P[ix]` per player: `k` last press counter the
  engine processed, `ok` count of `ctx.ack`, `s` last input sequence received and `sd` ms it was held before this HUD
  (phone RTT = now − send time of `s` − `sd`), `pl` live place (place games), `cd`/`cdT` cooldown from `ctx.cooldown`,
  `st`/`sc` the `ctx.status` line, `vb`/`vm` vibration counter and length (the phone buzzes when `vb` grows).
  Sent only when something changed: press-related changes and status lines at most every 500 ms, anything else at most
  every 1 s, plus a 2.5 s heartbeat — at most 2 msgs/s for the whole room, whatever the number of players.
  Players not in the round get `{t:"idle"}` ("сыграешь в следующем раунде").

## Engine responsibilities (host)
- Integrates with the existing arena/vote: action games appear in the "Во что играем дальше?" vote like other games.
- Intro screen (title, rules, controls, player colors) ~5 s with 3-2-1, then play, then results screen (places, +points), then back to arena idle.
- Players present = players with an open connection at round start. Late joiners watch until next round.
- Admin "Дальше"/"Прервать игру" must work during action games too. "Дальше": intro → start now; play → finish with
  current standings; finish banner/results → next. "Прервать игру": back to arena idle, no points.
- Points are guarded by the shared `scored` set (`"act"+round`), so they are never added twice.
- Distinct colors for up to 10 players.

## Phone controller (player side)
- Screen `pPad`, full screen, console-style. Title + rules + "твой цвет" only during the intro; nothing to read during play.
- Landscape is the main layout: left half = floating joystick (the touch point becomes the centre; translucent base +
  knob only), right half = action button hit area with a big round button. Portrait fallback: stick on top, button below,
  plus a gentle «Поверни телефон ↻» hint. On the first finger lift in a stick game the pad tries fullscreen +
  `screen.orientation.lock("landscape")` (optional, ignored where unsupported) and undoes it after the round.
- "tap" games: everything under the top strip is one tap target, a ripple per finger; every finger counts.
- Stick and button track their own pointers: two thumbs work at once. `touch-action:none`, no callout/context menu,
  `pointercancel` handled, safe-area insets respected.
- Top strip (HUD): time left (mm:ss + thin bar at the top edge), place «2-й из 6» or «На льдине 4/6», connection dot with
  RTT (green < 250 ms, yellow < 600 ms, red otherwise), score. The admin remote collapses to a 44 px ☰ button in the
  strip and opens as a sheet over a dimmed backdrop; it never overlaps the hit areas.
- Press feedback: instant local press animation; the flash + vibration only when the host confirms (`ok`/`k` echo); a
  press that reached the host during cooldown gets a small shake. No echo within 2 s (or no HUD for 6 s) →
  «нет связи» chip; the phone then probes its transports (a dead one is rebuilt) and knocks at the host. The knob glows while the host is acknowledging recent
  stick input and turns grey when that is stale for > 1 s.
- Screen edge glows in the player's colour; the game's `ctx.status` line is a big pill at the top centre (colour tints
  the pill and the screen edge, `vibrate` buzzes).
- Shows "Ты выбыл — смотри на экран" when out, and result screen at the end.

## Host screen
- The intro wraps long rules/hint lines (max 3 / 2 lines).
- During an action round the host buttons (`#aCtl`) are hidden over the canvas and appear while the mouse moves
  (or a button has keyboard focus); the admin phone's remote works as always.
- Drawing follows `requestAnimationFrame`; while the host tab is hidden (rAF paused) a timer keeps calling `update`, so a round still ends on time.
