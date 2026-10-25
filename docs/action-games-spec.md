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

## Network protocol (engine)
- phone → host: `{t:"in", x, y, b, k, s}` (k = press counter, s = optional message sequence number, echoed in the HUD), QoS 0 (`mqttBus().pub(topic, w, qos)` takes an optional QoS).
  Sent immediately on touch/press/release (then repeated for 300 ms in case one is dropped), every ~80 ms (~12 Hz)
  while the value changes, and as a 400 ms heartbeat while the stick or button is held still.
- host → phone: `{t:"pad", ph, game, title, rules, controls, btnLabel, color, place, gain, score, st, sc, vib}`
  with `ph` ∈ `"intro"` (rules + countdown), `"play"`, `"out"` (eliminated, still watching), `"res"` (round result).
  Extra fields: `round` (round id, changes every round), `left` (seconds until start, intro only), `n` (players in round),
  `st`/`sc` (current `ctx.status` text/colour, also in the state re-sent on rejoin), `vib` (ms, only on the message that
  carries a fresh status change).
  Also `dur` (round length), `hm` (`"place"`|`"alive"`), `hl` (alive label) and `hud` (the current HUD object below,
  during play/out) so a rejoining phone has everything at once.
- host → phone during play: `{t:"hud", round, tl, tx, pl, al, n, k, ok, s, sd, cd, cdT}`, QoS 0, only when something
  changed: `tl`/`tx` seconds left (whole / 0.1 s), `pl` live place from `standings()` (place games), `al`/`n` alive /
  players, `k` last press counter the engine processed, `ok` count of `ctx.ack` for this player, `s` last input sequence
  received and `sd` ms it was held before this HUD (phone RTT = now − send time of `s` − `sd`), `cd`/`cdT` cooldown from
  `ctx.cooldown`. Press-related changes (k/ok/cooldown restart) go out at most every 60 ms ("stick+btn" games only),
  everything else at most every 300 ms, so a phone gets ~1 HUD/s idle and ~3–4/s while playing actively
  (measured: 4 phones, coins, everybody moving and pressing: ~3.7 HUD/s per phone, ~4.9 msgs/s per phone in total).
  Old phones ignore `hud`; phones that do not send `s` simply get no RTT.
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
  press that reached the host during cooldown gets a small shake. No echo within ~700 ms (or no HUD for 2.5 s) →
  «нет связи» chip, and the reconnect knock runs immediately. The knob glows while the host is acknowledging recent
  stick input and turns grey when that is stale for > 1 s.
- Screen edge glows in the player's colour; the game's `ctx.status` line is a big pill at the top centre (colour tints
  the pill and the screen edge, `vibrate` buzzes).
- Shows "Ты выбыл — смотри на экран" when out, and result screen at the end.

## Host screen
- The intro wraps long rules/hint lines (max 3 / 2 lines).
- During an action round the host buttons (`#aCtl`) are hidden over the canvas and appear while the mouse moves
  (or a button has keyboard focus); the admin phone's remote works as always.
- Drawing follows `requestAnimationFrame`; while the host tab is hidden (rAF paused) a timer keeps calling `update`, so a round still ends on time.
