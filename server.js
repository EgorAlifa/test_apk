#!/usr/bin/env node
// Local party-show server: static files + /video.mp4 from parts + WebSocket relay at /relay.
// Node.js >= 18, zero npm dependencies. Run: `node server.js` (PORT=xxxx to override, default 8080).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8080;
const VIDEO_TOTAL_EXPECTED = 97240930;
const MAX_MESSAGE = 1024 * 1024; // 1 MiB
const PING_EVERY_MS = 15000;
const DROP_SILENT_MS = 45000;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.apk': 'application/vnd.android.package-archive',
};

function log(...args) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}]`, ...args);
}

// ---------------------------------------------------------------- LAN addresses
function lanIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal) out.push(a.address);
    }
  }
  return out;
}
function lanURLs() {
  return lanIPs().map((ip) => `http://${ip}:${PORT}/`);
}

// ---------------------------------------------------------------- helpers
function sendText(res, code, text, extra) {
  if (res.headersSent) { try { res.end(); } catch (_) {} return; }
  res.writeHead(code, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  }, extra || {}));
  res.end(text);
}

// Parses a single "bytes=" range. Returns {start,end} | null (no/ignored range) | 'invalid' (416).
function parseRange(header, size) {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return null; // multi-range or garbage: ignore and send the full body (allowed by RFC 7233)
  let start, end;
  if (m[1] === '' && m[2] === '') return 'invalid';
  if (m[1] === '') { // suffix: last N bytes
    const n = parseInt(m[2], 10);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
    if (start >= size || end < start) return 'invalid';
  }
  return { start, end };
}

// Serves a "virtual file" made of segments [{file, size}] with Range support.
function serveSegments(req, res, segments, mime) {
  const size = segments.reduce((s, x) => s + x.size, 0);
  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  const r = parseRange(req.headers.range, size);
  if (r === 'invalid') {
    return sendText(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' });
  }
  let start = 0, end = size - 1, code = 200;
  if (r) { start = r.start; end = r.end; code = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`; }
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(code, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();

  // Build the list of (file, from, to) slices covering [start, end].
  const slices = [];
  let offset = 0;
  for (const seg of segments) {
    const segStart = offset, segEnd = offset + seg.size - 1;
    offset += seg.size;
    if (seg.size === 0 || segEnd < start || segStart > end) continue;
    slices.push({ file: seg.file, from: Math.max(start, segStart) - segStart, to: Math.min(end, segEnd) - segStart });
  }

  let current = null;
  let aborted = false;
  const abort = () => { aborted = true; if (current) current.destroy(); };
  res.on('close', abort);
  const next = (i) => {
    if (aborted) return;
    if (i >= slices.length) return res.end();
    const s = slices[i];
    current = fs.createReadStream(s.file, { start: s.from, end: s.to });
    current.on('error', (e) => { log('Ошибка чтения', path.basename(s.file), e.message); res.destroy(); });
    current.on('end', () => next(i + 1));
    current.pipe(res, { end: false });
  };
  next(0);
}

let videoSegmentsCache = null;
function videoSegments() {
  const whole = path.join(ROOT, 'video.mp4');
  try {
    const st = fs.statSync(whole);
    if (st.isFile()) return [{ file: whole, size: st.size }];
  } catch (_) {}
  const segs = [];
  for (let i = 0; i <= 4; i++) {
    const f = path.join(ROOT, `video.mp4.part${i}`);
    try { segs.push({ file: f, size: fs.statSync(f).size }); } catch (_) { return null; }
  }
  return segs;
}

// Resolves a URL path to a file inside ROOT, or null if unsafe.
function safePath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (_) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const parts = decoded.split('/');
  for (const p of parts) {
    if (p === '..' || p === '.') return null;
    if (p.startsWith('.') ) return null; // no dotfiles (.git, .github, .claude, ...)
  }
  const full = path.resolve(ROOT, '.' + path.posix.normalize('/' + decoded));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function serveStatic(req, res, urlPath) {
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const full = safePath(urlPath);
  if (!full) return sendText(res, 403, 'Forbidden');
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return sendText(res, 404, 'Not found'); // directories: no listing
    const mime = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    if (mime.startsWith('video/') || mime.startsWith('audio/')) {
      return serveSegments(req, res, [{ file: full, size: st.size }], mime);
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'Last-Modified': st.mtime.toUTCString(),
    });
    if (req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(full);
    rs.on('error', () => res.destroy());
    res.on('close', () => rs.destroy());
    rs.pipe(res);
  });
}

// ---------------------------------------------------------------- HTTP
const server = http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    }
    let urlPath = (req.url || '/').split('?')[0].split('#')[0];
    if (!urlPath.startsWith('/')) return sendText(res, 400, 'Bad Request');

    if (urlPath === '/__local') {
      const body = JSON.stringify({ local: true, urls: lanURLs(), port: PORT });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (urlPath === '/relay') {
      return sendText(res, 426, 'Upgrade Required', { Upgrade: 'websocket', Connection: 'Upgrade' });
    }
    if (urlPath === '/video.mp4') {
      const segs = videoSegments();
      if (!segs) return sendText(res, 404, 'video not found');
      if (!videoSegmentsCache) {
        videoSegmentsCache = true;
        const total = segs.reduce((s, x) => s + x.size, 0);
        if (segs.length > 1 && total !== VIDEO_TOTAL_EXPECTED) {
          log(`Внимание: размер видео ${total} байт, ожидалось ${VIDEO_TOTAL_EXPECTED}`);
        }
      }
      return serveSegments(req, res, segs, 'video/mp4');
    }
    return serveStatic(req, res, urlPath);
  } catch (e) {
    log('Ошибка запроса:', e && e.message);
    sendText(res, 500, 'Internal Server Error');
  }
});
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch (_) {}
});

// ---------------------------------------------------------------- WebSocket relay
const topics = new Map(); // topic -> Set<Client>
const clients = new Set();

class Client {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = null;      // {opcode, chunks, size} while assembling a fragmented message
    this.subs = new Set();
    this.lastSeen = Date.now();
    this.closed = false;
  }

  send(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127;
      header.writeUInt32BE(Math.floor(len / 2 ** 32), 2); header.writeUInt32BE(len >>> 0, 6);
    }
    try { this.socket.write(Buffer.concat([header, payload])); } catch (_) { this.destroy(); }
  }
  sendText(str) { this.send(0x1, Buffer.from(str, 'utf8')); }
  sendJSON(obj) { this.sendText(JSON.stringify(obj)); }

  close(code, reason) {
    if (this.closed) return;
    const r = Buffer.from(reason || '', 'utf8');
    const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code || 1000, 0); r.copy(p, 2);
    this.send(0x8, p);
    this.closed = true;
    try { this.socket.end(); } catch (_) {}
    setTimeout(() => this.destroy(), 2000).unref();
  }

  destroy() {
    this.closed = true;
    try { this.socket.destroy(); } catch (_) {}
  }

  onData(chunk) {
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (!this.closed) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const rsv = b[0] & 0x70;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6);
        if (hi !== 0) return this.close(1009, 'too big');
        len = lo; off = 10;
      }
      if (rsv) return this.close(1002, 'rsv');
      if (!masked) return this.close(1002, 'unmasked');
      const isControl = opcode >= 0x8;
      if (isControl && (len > 125 || !fin)) return this.close(1002, 'bad control');
      if (len > MAX_MESSAGE) return this.close(1009, 'too big');
      if (b.length < off + 4 + len) return; // wait for more
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this.onFrame(fin, opcode, payload);
    }
  }

  onFrame(fin, opcode, payload) {
    switch (opcode) {
      case 0x8: { // close
        let code = 1000;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        if (code === 1005 || code === 1006 || code < 1000 || code >= 5000) code = 1000;
        return this.close(code === 1000 ? 1000 : code, '');
      }
      case 0x9: return this.send(0xA, payload); // ping -> pong
      case 0xA: return; // pong: lastSeen already updated
      case 0x0: { // continuation
        if (!this.frag) return this.close(1002, 'unexpected continuation');
        this.frag.size += payload.length;
        if (this.frag.size > MAX_MESSAGE) return this.close(1009, 'too big');
        this.frag.chunks.push(payload);
        if (fin) {
          const f = this.frag; this.frag = null;
          this.onMessage(f.opcode, Buffer.concat(f.chunks, f.size));
        }
        return;
      }
      case 0x1: case 0x2: {
        if (this.frag) return this.close(1002, 'expected continuation');
        if (!fin) { this.frag = { opcode, chunks: [payload], size: payload.length }; return; }
        return this.onMessage(opcode, payload);
      }
      default: return this.close(1002, 'bad opcode');
    }
  }

  onMessage(opcode, data) {
    if (opcode !== 0x1) return; // binary frames are ignored
    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    const t = msg.t;
    switch (msg.op) {
      case 'sub':
        if (typeof t !== 'string' || !t) return;
        this.subs.add(t);
        if (!topics.has(t)) topics.set(t, new Set());
        topics.get(t).add(this);
        return;
      case 'unsub':
        if (typeof t !== 'string') return;
        this.subs.delete(t);
        if (topics.has(t)) { topics.get(t).delete(this); if (!topics.get(t).size) topics.delete(t); }
        return;
      case 'pub': {
        if (typeof t !== 'string' || !t) return;
        const m = typeof msg.m === 'string' ? msg.m : JSON.stringify(msg.m === undefined ? null : msg.m);
        const set = topics.get(t);
        if (!set) return;
        const frame = JSON.stringify({ t, m });
        for (const c of set) if (c !== this) c.sendText(frame);
        return;
      }
      case 'ping':
        return this.sendJSON({ op: 'pong' });
      default:
        return;
    }
  }

  cleanup() {
    for (const t of this.subs) {
      const set = topics.get(t);
      if (set) { set.delete(this); if (!set.size) topics.delete(t); }
    }
    this.subs.clear();
  }
}

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  try {
    const urlPath = (req.url || '').split('?')[0];
    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    if (urlPath !== '/relay' || upgrade !== 'websocket' || !key || req.method !== 'GET') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true);
    const c = new Client(socket);
    clients.add(c);
    const who = req.socket.remoteAddress ? String(req.socket.remoteAddress).replace(/^::ffff:/, '') : '?';
    log(`Подключение ${who}, всего: ${clients.size}`);
    let gone = false;
    const onGone = () => {
      if (gone) return;
      gone = true;
      c.closed = true;
      c.cleanup();
      clients.delete(c);
      log(`Отключение ${who}, всего: ${clients.size}`);
    };
    socket.on('data', (d) => {
      try { c.onData(d); } catch (e) { log('Ошибка relay:', e && e.message); c.destroy(); }
    });
    socket.on('close', onGone);
    socket.on('end', () => { try { socket.end(); } catch (_) {} });
    if (head && head.length) socket.emit('data', head);
  } catch (e) {
    log('Ошибка upgrade:', e && e.message);
    try { socket.destroy(); } catch (_) {}
  }
});

setInterval(() => {
  const now = Date.now();
  for (const c of clients) {
    if (now - c.lastSeen > DROP_SILENT_MS) { log('Сокет молчит 45 с — отключаю'); c.destroy(); continue; }
    c.send(0x9, Buffer.alloc(0));
  }
}, PING_EVERY_MS).unref();

// ---------------------------------------------------------------- start
process.on('uncaughtException', (e) => { log('Непредвиденная ошибка:', e && e.stack || e); });
process.on('unhandledRejection', (e) => { log('Непредвиденная ошибка:', e); });

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nПорт ${PORT} уже занят. Закройте другой сервер или запустите с другим портом, например:\n  PORT=8081 node server.js\n`);
  } else {
    console.error('Не удалось запустить сервер:', e.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const urls = lanURLs();
  const line = '='.repeat(60);
  console.log(line);
  console.log('  Сервер праздника запущен');
  console.log(line);
  if (urls.length) {
    console.log('  Откройте этот адрес на ноутбуке ведущего:');
    for (const u of urls) console.log('    ' + u);
    if (urls.length > 1) console.log('  (несколько адресов — выберите тот, что из сети Wi-Fi праздника)');
  } else {
    console.log('  Сеть не найдена! Подключите ноутбук к Wi-Fi и перезапустите сервер.');
    console.log(`  Пока можно открыть только на этом ноутбуке: http://localhost:${PORT}/`);
  }
  console.log('  Гости должны быть в той же сети Wi-Fi.');
  console.log('  Чтобы остановить сервер, закройте это окно (или Ctrl+C).');
  console.log(line);
});
