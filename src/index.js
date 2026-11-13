function cleanResi(text) {
  if (!text) return '';
  let cleaned = String(text).trim().toUpperCase();
  const spx = cleaned.match(/SPX[A-Z0-9]{8,}/i);
  if (spx) return spx[0].toUpperCase();
  const to = cleaned.match(/TO[A-Z0-9]{6,}/i);
  if (to) return to[0].toUpperCase();
  return cleaned.replace(/[^A-Z0-9\-]/g, '');
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(json = true) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

function uid() {
  return crypto.randomUUID();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function pbkdf2Hash(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(buf) {
  let str = '';
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function signToken(payload, secret) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = header + '.' + body;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return data + '.' + b64url(new Uint8Array(sig));
}

async function verifyToken(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const data = parts[0] + '.' + parts[1];
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(data));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function authSecret(env) {
  return env.AUTH_SECRET || 'dc-siborong-dev-secret-change-me';
}

async function getUserFromRequest(request, env) {
  const h = request.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token || !env.DB) return null;
  const payload = await verifyToken(token, authSecret(env));
  if (!payload || !payload.sub) return null;
  return await env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').bind(payload.sub).first();
}

async function trackSPX(resi) {
  const timestamp = Math.floor(Date.now() / 1000);
  const secrets = ['MGViZmZmZTYzZDJhNDgxY2Y1N2ZlN2Q1ZWJkYzlmZDY=', '0ebfffe63d2a481cf57fe7d5ebdc9fd6', 'MGViZmZmZTYzZDJhNDgxY2Y1N2ZlN2Q1ZWJkYzlmZDY'];
  for (const secret of secrets) {
    try {
      const hash = await sha256(resi + timestamp + secret);
      const apiUrl = 'https://spx.co.id/api/v2/fleet_order/tracking/search?sls_tracking_number=' + encodeURIComponent(resi) + '|' + timestamp + hash;
      const response = await fetch(apiUrl, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) continue;
      const data = await response.json();
      if (data && (data.data || data.retcode === 0)) return { success: true, courier: 'spx', resi, data };
    } catch (e) {}
  }
  return { success: false, courier: 'spx', resi, message: 'Gagal mengambil data dari SPX.', officialUrl: 'https://spx.co.id/?trackingNumber=' + encodeURIComponent(resi) };
}

async function trackBinderByte(resi, courier, apiKey) {
  if (!apiKey) return { success: false, courier, resi, message: 'BINDERBYTE_API_KEY belum diset.' };
  try {
    const url = 'https://api.binderbyte.com/v1/track?api_key=' + encodeURIComponent(apiKey) + '&courier=' + encodeURIComponent(courier) + '&awb=' + encodeURIComponent(resi);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (data && (data.status === 200 || data.status === '200') && data.data) {
      const detail = data.data.summary || data.data || {};
      const summary = data.data.summary || {};
      return { success: true, courier, resi, data: { detail: { status: detail.status || summary.status || '', receiver: detail.receiver || summary.receiver || '' }, summary, detail, history: data.data.history || [], raw: data } };
    }
    return { success: false, courier, resi, message: (data && (data.message || data.msg)) || 'Resi tidak ditemukan' };
  } catch (err) {
    return { success: false, courier, resi, message: 'Gagal BinderByte: ' + (err.message || 'error') };
  }
}

function detectCourier(resi) {
  const r = (resi || '').toUpperCase();
  if (r.startsWith('SPX') || r.startsWith('TO')) return 'spx';
  if (/^JP/i.test(r) || /^JT/i.test(r)) return 'jnt';
  if (/^SCP/i.test(r) || /^SC/i.test(r)) return 'sicepat';
  return null;
}

async function handleTrack(request, env) {
  try {
    const url = new URL(request.url);
    const resi = cleanResi(url.searchParams.get('resi') || '');
    let courier = (url.searchParams.get('courier') || 'spx').toLowerCase().trim();
    if (!resi || resi.length < 6) return json({ success: false, message: 'Nomor resi tidak valid' }, 400);
    if (courier === 'auto') courier = detectCourier(resi) || 'spx';
    return json(courier === 'spx' ? await trackSPX(resi) : await trackBinderByte(resi, courier, env.BINDERBYTE_API_KEY));
  } catch (err) {
    return json({ success: false, message: 'Server error' }, 500);
  }
}

async function handleRegister(request, env) {
  if (!env.DB) return json({ success: false, message: 'Database belum dikonfigurasi (D1).' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ success: false, message: 'Body tidak valid' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim() || email.split('@')[0];
  if (!isValidEmail(email)) return json({ success: false, message: 'Email tidak valid' }, 400);
  if (password.length < 6) return json({ success: false, message: 'Password minimal 6 karakter' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ success: false, message: 'Email sudah terdaftar' }, 409);
  const id = uid();
  const salt = randomSalt();
  const password_hash = await pbkdf2Hash(password, salt);
  const created_at = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, email, password_hash, salt, name, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, email, password_hash, salt, name, created_at).run();
  await env.DB.prepare('INSERT INTO user_store (user_id, history, stok, sj, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, '[]', '[]', '[]', created_at).run();
  const token = await signToken({ sub: id, email, exp: Math.floor(Date.now() / 1000) + 2592000 }, authSecret(env));
  return json({ success: true, token, user: { id, email, name, created_at } });
}

async function handleLogin(request, env) {
  if (!env.DB) return json({ success: false, message: 'Database belum dikonfigurasi (D1).' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ success: false, message: 'Body tidak valid' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!isValidEmail(email) || !password) return json({ success: false, message: 'Email / password wajib' }, 400);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ success: false, message: 'Email atau password salah' }, 401);
  const hash = await pbkdf2Hash(password, user.salt);
  if (hash !== user.password_hash) return json({ success: false, message: 'Email atau password salah' }, 401);
  const token = await signToken({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 2592000 }, authSecret(env));
  return json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at } });
}

async function handleMe(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
  return json({ success: true, user });
}

async function handleSyncGet(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT history, stok, sj, updated_at FROM user_store WHERE user_id = ?').bind(user.id).first();
  if (!row) return json({ success: true, data: { history: [], stok: [], sj: [] }, updated_at: null });
  let history = [], stok = [], sj = [];
  try { history = JSON.parse(row.history || '[]'); } catch (e) {}
  try { stok = JSON.parse(row.stok || '[]'); } catch (e) {}
  try { sj = JSON.parse(row.sj || '[]'); } catch (e) {}
  return json({ success: true, data: { history, stok, sj }, updated_at: row.updated_at });
}

async function handleSyncPut(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ success: false, message: 'Body tidak valid' }, 400); }
  const history = Array.isArray(body.history) ? body.history : [];
  const stok = Array.isArray(body.stok) ? body.stok : [];
  const sj = Array.isArray(body.sj) ? body.sj : [];
  const updated_at = new Date().toISOString();
  if (JSON.stringify({ history, stok, sj }).length > 4500000) return json({ success: false, message: 'Data terlalu besar' }, 413);
  await env.DB.prepare('INSERT INTO user_store (user_id, history, stok, sj, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET history = excluded.history, stok = excluded.stok, sj = excluded.sj, updated_at = excluded.updated_at').bind(user.id, JSON.stringify(history), JSON.stringify(stok), JSON.stringify(sj), updated_at).run();
  return json({ success: true, updated_at });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(false) });
    if (path === '/api/track') return handleTrack(request, env);
    if (path === '/api/auth/register' && request.method === 'POST') return handleRegister(request, env);
    if (path === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
    if (path === '/api/auth/me' && request.method === 'GET') return handleMe(request, env);
    if (path === '/api/sync' && request.method === 'GET') return handleSyncGet(request, env);
    if (path === '/api/sync' && request.method === 'PUT') return handleSyncPut(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  }
};
