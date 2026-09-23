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
    if(buf.length+chunk.length>2048){close(1009);return;}
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
        if (n > 1024n) { close(1009); return; }
        len = Number(n);
        offset = 10;
      }
      if(len>1024){close(1009);return;}
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

const LINK_TTL_MS = 12 * 60 * 1000;
const LINK_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const linkCodes = new Map();
const linkHits = new Map();

const clientIp = (req) => {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
};

const readJson = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 4096) { req.destroy(); reject(new Error('too large')); }
  });
  req.on('end', () => {
    try { resolve(raw ? JSON.parse(raw) : {}); }
    catch { reject(new Error('invalid json')); }
  });
  req.on('error', reject);
});

const rateOk = (ip, kind, max) => {
  const now = Date.now();
  const key = kind + ':' + ip;
  if(!linkHits.has(key)&&linkHits.size>=4096)return false;
  const hits = (linkHits.get(key) || []).filter((t) => now - t < LINK_TTL_MS);
  if (hits.length >= max) { linkHits.set(key, hits); return false; }
  hits.push(now);
  linkHits.set(key, hits);
  return true;
};

const pruneCodes = () => {
  const now = Date.now();
  for(const [key,hits] of linkHits)if(!hits.length||hits.at(-1)<now-LINK_TTL_MS)linkHits.delete(key);
  for (const [code, row] of linkCodes) if (row.used || row.exp < now) linkCodes.delete(code);
};

const makeCode = () => {
  for (let n = 0; n < 8; n++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += LINK_CHARS[crypto.randomInt(LINK_CHARS.length)];
    if (!linkCodes.has(c)) return c;
  }
  throw new Error('Could not allocate a code');
};

const json = (res, code, body) => send(res, code, JSON.stringify(body), 'application/json; charset=utf-8');

const handleLink = async (req, res, pathname) => {
  if (req.method !== 'POST') return json(res, 405, {error: 'POST only'});
  pruneCodes();
  const ip = clientIp(req);
  let body;
  try { body = await readJson(req); }
  catch { return json(res, 400, {error: 'Invalid JSON'}); }
  if (pathname === '/api/link-code') {
    if (!rateOk(ip, 'issue', 8)) return json(res, 429, {error: 'Too many codes. Wait a few minutes.'});
    const id = String(body.id || '');
    const token = String(body.token || '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || token.length < 8 || token.length > 200) {
      return json(res, 400, {error: 'Join the world first.'});
    }
    if(linkCodes.size>=1024)return json(res,503,{error:'Login codes are busy. Try again shortly.'});
    const code = makeCode();
    linkCodes.set(code, {id, token, exp: Date.now() + LINK_TTL_MS, used: false});
    return json(res, 200, {code, expires_in: 720});
  }
  if (pathname === '/api/link-redeem') {
    if (!rateOk(ip, 'redeem', 20)) return json(res, 429, {error: 'Too many tries. Wait a few minutes.'});
    const code = String(body.code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const row = linkCodes.get(code);
    if (!row || row.used || row.exp < Date.now()) return json(res, 400, {error: 'Code expired or already used'});
    row.used = true;
    linkCodes.delete(code);
    return json(res, 200, {id: row.id, token: row.token});
  }
  return json(res, 404, {error: 'Not found'});
};

const assetCache=new Map();
async function statAsset(file){if(process.env.NODE_ENV==='production'&&assetCache.has(file))return assetCache.get(file);const st=await fsp.stat(file).catch(()=>null);if(st?.isFile()&&assetCache.size<256&&process.env.NODE_ENV==='production')assetCache.set(file,st);return st;}
const server = http.createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:15000,keepAliveTimeout:5000},async (req, res) => {
  try {
    const u = new URL(req.url, 'http://local');
    if (u.pathname === '/healthz') {
      return send(res, 200, JSON.stringify({ ok: true, service: 'carbons-minecraft' }), 'application/json; charset=utf-8');
    }
    if (u.pathname === '/api/link-code' || u.pathname === '/api/link-redeem') {
      return handleLink(req, res, u.pathname);
    }
    if (u.pathname === WS_PATH) return send(res, 426, 'Upgrade Required');
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.includes('..')) return send(res, 400, 'Bad path');
    let file = path.join(root, rel);
    let st = await statAsset(file);
    if (!st?.isFile()) {
      file = path.join(root, 'index.html');
      st = await statAsset(file);
    }
    const ext = path.extname(file).toLowerCase();
    const accepts=String(req.headers['accept-encoding']||'');let encoding;
    if(process.env.NODE_ENV==='production'&&['.html','.js','.css'].includes(ext)){for(const [enc,suffix] of [['br','.br'],['gzip','.gz']])if(accepts.split(',').some(v=>v.trim().split(';')[0]===enc&&!/;\s*q=0(?:\.0*)?$/.test(v.trim()))){const compressed=await statAsset(file+suffix);if(compressed){file+=suffix;st=compressed;encoding=enc;break;}}}
    const etag='W/"'+st.size+'-'+Math.floor(st.mtimeMs)+'-'+(encoding||'raw')+'"';
    if(req.headers['if-none-match']===etag){res.writeHead(304,{etag,vary:'Accept-Encoding'});res.end();return;}
    res.writeHead(200, {
      etag,vary:'Accept-Encoding',...(encoding?{'content-encoding':encoding}:{}),
      'content-type': types[ext] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'cache-control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
      'content-length': st.size,
    });
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  } catch {
    send(res, 500, 'Server error');
  }
});

server.maxConnections=128;
const keepaliveSockets=new Set();
server.on('upgrade', (req, socket, head) => {
  try {
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    const keyRaw = req.headers['sec-websocket-key'];
    const key = Array.isArray(keyRaw) ? keyRaw[0] : keyRaw;
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    const version = String(req.headers['sec-websocket-version'] || '');
    if (keepaliveSockets.size>=32 || pathname !== WS_PATH || req.method !== 'GET' || upgrade !== 'websocket' || !key || version !== '13') {
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
    keepaliveSockets.add(socket);socket.once('close',()=>keepaliveSockets.delete(socket));
    handleKeepaliveSocket(socket);
  } catch {
    try { socket.destroy(); } catch {}
  }
});

server.listen(port, '0.0.0.0', () => console.log('Carbons Minecraft listening on 0.0.0.0:' + port));
