# Local mode + public brokers, working at the same time

Goal: the show must work even when the public MQTT brokers are flaky or unreachable. The host laptop can
optionally run a tiny local server; guests on the same Wi-Fi then talk to the laptop directly, while guests
on mobile internet keep using the public brokers. Both transports run **simultaneously** and the existing
dedupe in `mqttBus` (message id `w.i`) merges them.

## Modes
- **Online only** (as today): page from GitHub Pages, transports = public brokers.
- **Local + online**: the host opens the page from the laptop server (`http://<laptop-ip>:8080/`).
  Transports = local relay + public brokers. Phones that opened the local URL use both; phones that opened
  the GitHub URL use brokers only. Everything still works if the internet is down completely
  (local transport only; video, scripts and fonts are served by the laptop).

A page served over `https` (GitHub Pages) can't open `ws://` to a LAN address (mixed content), so the local
relay is only used by pages served from the laptop itself.

## Local server: `server.js` (repo root)
- Node.js ≥ 18, **zero npm dependencies** (only `http`, `fs`, `path`, `os`, `crypto`).
- Run: `node server.js` (default port 8080, `PORT=xxxx` to override). Start scripts: `start-windows.bat`,
  `start-mac.command` (double-click), both just run `node server.js` from their folder.
- Prints the LAN URLs (all non-internal IPv4 addresses), e.g. `http://192.168.1.5:8080/`.
- Static files from the repo folder with correct MIME types (`.html .js .css .json .png .svg .woff2 .mp4`),
  no directory listing, no path traversal (`..` rejected).
- `GET /video.mp4`: if `video.mp4` exists serve it; otherwise stream `video.mp4.part0..part4` concatenated
  on the fly (no temp file), with HTTP Range support (206, `Content-Range`, `Accept-Ranges: bytes`), total
  size must equal the sum of the parts (97240930 bytes).
- `GET /__local` → `{"local":true,"urls":["http://192.168.1.5:8080/", …],"port":8080}` (no-store).
- WebSocket relay at `GET /relay` (RFC 6455 handshake, text frames, masking from clients, fragmented frames
  and frames > 64 KiB tolerated up to 1 MiB, close/ping/pong handled; server pings every 15 s and drops
  sockets silent for 45 s).

### Relay protocol (JSON text frames)
client → server:
- `{"op":"sub","t":"<topic>"}` — subscribe to an exact topic (no wildcards). A socket may hold several.
- `{"op":"pub","t":"<topic>","m":"<payload string>"}` — deliver to every socket subscribed to that topic
  (including other subscribers on the same topic; not echoed back to the sender).
- `{"op":"ping"}` → server answers `{"op":"pong"}`.
server → client:
- `{"t":"<topic>","m":"<payload string>"}`.
`m` is exactly the string the page would have published to MQTT (the JSON-encoded wrapper `w`).

## Page (index.html)
- `mqttBus` becomes transport-agnostic: a list of transports, each with `connected`, `publish(topic, str, qos)`,
  `subscribe(topic)`, `kick()`; MQTT brokers are transports, the local relay is another.
- Local transport is enabled when `fetch("/__local")` succeeds with `local:true` (try once at start, ~1.5 s timeout).
- Host lobby in local mode shows **two** join options: the big QR = local URL (`http://<ip>:8080/#join=<id>`,
  label «Wi-Fi праздника»), plus a smaller QR/link = GitHub Pages URL (`PUBLIC_URL` const,
  `https://egoralifa.github.io/test_apk/`) for guests on mobile internet («Мобильный интернет»).
- Third-party scripts are vendored into `vendor/` (`mqtt.min.js` 5.10.1, `qrcode.min.js` 1.0.0) and loaded
  from there in both modes; Google Fonts stay optional (system font fallback already exists).
- Connection diagnostics: tapping the connection dot on a phone (and a small link on the host lobby) opens a
  panel listing each transport (local / emqx / hivemq / mosquitto): state, last error, reconnect count,
  round-trip time to the host.

### Page networking rules (implemented)
- Topics: phone → host `aeshow/<id>/h`, host → one phone `aeshow/<id>/p/<cid>`, host → every phone `aeshow/<id>/all`
  (phones act on `/all` only after the host has welcomed them). The relay and the brokers carry the same topics.
- Rate budget per client: token bucket of 8 msgs/s (burst 4: ~12 in any 1 s window, room for network bunching); QoS 0 extras are dropped, QoS 1 waits in order.
  QoS 1 only for game-critical messages (join, welcome, q, got, res, tap, pad phase changes, final, kicked, cmd/ack,
  admin state changes); QoS 0 for ping/pong, HUD, inputs, admin state refreshes.
- Reconnects: mqtt.js reconnects by itself (backoff 2 → 12 s, jittered); the local transport retries 1 → 10 s.
  A transport that has been quiet for 24 s, or when the page suspects trouble (phone woke up, host silent, command not
  acked, «нет связи»), gets a probe (MQTT: QoS 1 publish to `aeshow/probe/…`, answered by the broker's PUBACK; relay:
  `{op:"ping"}`). Only a transport that leaves the probe unanswered for 6 s is rebuilt (a brand-new mqtt client with a
  new clientId; never `end()+reconnect()` on the same client), at most once per 30 s per transport.
- Diagnostics: phone — tap the connection dot left of the name (in a game: the RTT dot top right; on the waiting screen
  also the «Диагностика связи» button); host — «Диагностика связи» under the QR code. Per transport: state, how long it
  has been up, messages in/out per second, round trip to the host (phone) / to the laptop (local), connects /
  disconnects / rebuilds, last packet, last error. «Скопировать отчёт» copies all of it as text to send to the
  developers; «Переподключить» rebuilds every transport once.
