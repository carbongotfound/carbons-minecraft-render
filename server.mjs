import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT) || 10000;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_IDLE_MS = 30_000;
const WS_PATH = '/ws/keepalive';

const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  });
  res.end(body);
};

const wsAccept = (key) => crypto.createHash('sha1').update(key + WS_GUID).digest('base64');

const wsFrame = (opcode, payload) => {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
};

const handleKeepaliveSocket = (socket) => {
  socket.setTimeout(WS_IDLE_MS);
  let buf = Buffer.alloc(0);
  let closed = false;

  const close = (code = 1000) => {
    if (closed) return;
    closed = true;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    try { socket.write(wsFrame(0x8, payload)); } catch {}
    socket.end();
  };

  socket.on('timeout', () => close(1000));
  socket.on('error', () => { closed = true; socket.destroy(); });
  socket.on('end', () => { closed = true; });
  socket.on('close', () => { closed = true; });

  socket.on('data', (chunk) => {
    if (closed) return;
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      const fin = (buf[0] & 0x80) !== 0;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const n = buf.readBigUInt64BE(2);
        if (n > 1_000_000n) { close(1009); return; }
        len = Number(n);
        offset = 10;
      }
      if (!masked) { close(1002); return; }
      if (buf.length < offset + 4 + len) return;
      const mask = buf.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.from(buf.subarray(offset, offset + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(offset + len);

      if (!fin) { close(1003); return; }
      if (opcode === 0x8) { close(1000); return; }
      if (opcode === 0x9) { try { socket.write(wsFrame(0xa, payload)); } catch {} continue; }
      if (opcode === 0xa) continue;
      if (opcode === 0x1) {
        if (payload.toString('utf8').trim() === 'ping') {
          try { socket.write(wsFrame(0x1, 'pong')); } catch {}
        }
        continue;
      }
      close(1003);
      return;
    }
  });
};

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://local');
    if (u.pathname === '/healthz') {
      return send(res, 200, JSON.stringify({ ok: true, service: 'carbons-minecraft' }), 'application/json; charset=utf-8');
    }
    if (u.pathname === WS_PATH) return send(res, 426, 'Upgrade Required');
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.includes('..')) return send(res, 400, 'Bad path');
    let file = path.join(root, rel);
    let st = await fsp.stat(file).catch(() => null);
    if (!st?.isFile()) {
      file = path.join(root, 'index.html');
      st = await fsp.stat(file);
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'cache-control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
      'content-length': st.size,
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 500, 'Server error');
  }
});

server.on('upgrade', (req, socket, head) => {
  try {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const keyRaw = req.headers['sec-websocket-key'];
    const key = Array.isArray(keyRaw) ? keyRaw[0] : keyRaw;
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    const version = String(req.headers['sec-websocket-version'] || '');
    if (pathname !== WS_PATH || req.method !== 'GET' || upgrade !== 'websocket' || !key || version !== '13') {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n' +
      '\r\n',
    );
    if (head?.length) socket.unshift(head);
    handleKeepaliveSocket(socket);
  } catch {
    try { socket.destroy(); } catch {}
  }
});

server.listen(port, '0.0.0.0', () => console.log('Carbons Minecraft listening on 0.0.0.0:' + port));
