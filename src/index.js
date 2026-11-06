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
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(json = true) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function trackSPX(resi) {
  const timestamp = Math.floor(Date.now() / 1000);
  const secrets = [
    'MGViZmZmZTYzZDJhNDgxY2Y1N2ZlN2Q1ZWJkYzlmZDY=',
    '0ebfffe63d2a481cf57fe7d5ebdc9fd6',
    'MGViZmZmZTYzZDJhNDgxY2Y1N2ZlN2Q1ZWJkYzlmZDY'
  ];

  for (const secret of secrets) {
    try {
      const raw = resi + timestamp + secret;
      const hash = await sha256(raw);
      const apiUrl = `https://spx.co.id/api/v2/fleet_order/tracking/search?sls_tracking_number=${encodeURIComponent(resi)}|${timestamp}${hash}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data && (data.data || data.retcode === 0)) {
        return { success: true, courier: 'spx', resi, data };
      }
    } catch (e) {}
  }
  return {
    success: false,
    courier: 'spx',
    resi,
    message: 'Gagal mengambil data dari SPX. Silakan coba lagi atau buka situs resmi.',
    officialUrl: `https://spx.co.id/?trackingNumber=${encodeURIComponent(resi)}`
  };
}

async function trackBinderByte(resi, courier, apiKey) {
  if (!apiKey) {
    return {
      success: false,
      courier,
      resi,
      message: 'BINDERBYTE_API_KEY belum diset di Cloudflare. Tambahkan secret dulu.'
    };
  }

  const url = `https://api.binderbyte.com/v1/track?api_key=${encodeURIComponent(apiKey)}&courier=${encodeURIComponent(courier)}&awb=${encodeURIComponent(resi)}`;
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();

    // BinderByte: status 200 = sukses
    if (data && (data.status === 200 || data.status === '200') && data.data) {
      // Normalisasi ke format mirip SPX agar frontend seragam
      const summary = data.data.summary || {};
      const history = data.data.history || [];
      const tracking_list = history.map(h => ({
        time: h.date || h.time || '',
        message: h.desc || h.status || h.message || '',
        status: h.status || h.desc || ''
      }));

      const detail = data.data.detail || {};
      return {
        success: true,
        courier,
        resi,
        data: {
          data: {
            status: summary.status || summary.latest || tracking_list[0]?.message || 'OK',
            current_status: summary.status || '',
            tracking_list,
            recipient_name: detail.receiver || detail.consignee || summary.receiver || '',
            phone: detail.phone || '',
            delivery_type: summary.service || detail.service || '',
            destination: detail.destination || summary.destination || '',
            origin: detail.origin || summary.origin || ''
          },
          summary,
          detail,
          raw: data
        }
      };
    }

    return {
      success: false,
      courier,
      resi,
      message: data?.message || data?.msg || 'Resi tidak ditemukan / kurir salah.',
      binder: data
    };
  } catch (err) {
    return {
      success: false,
      courier,
      resi,
      message: 'Gagal terhubung ke BinderByte: ' + (err.message || 'error')
    };
  }
}

function detectCourier(resi) {
  const r = (resi || '').toUpperCase();
  if (r.startsWith('SPX')) return 'spx';
  if (r.startsWith('TO')) return 'spx'; // trip SPX internal
  if (/^JNE/i.test(r) || /^\d{10,16}$/.test(r)) return null; // ambigu, biar user pilih
  if (/^JP/i.test(r) || /^JT/i.test(r)) return 'jnt';
  if (/^SCP/i.test(r) || /^SC/i.test(r)) return 'sicepat';
  return null;
}

async function handleTrack(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(false) });
  }

  try {
    const url = new URL(request.url);
    const resi = cleanResi(url.searchParams.get('resi') || '');
    let courier = (url.searchParams.get('courier') || 'spx').toLowerCase().trim();

    if (!resi || resi.length < 6) {
      return new Response(JSON.stringify({ success: false, message: 'Nomor resi tidak valid' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    if (courier === 'auto') {
      courier = detectCourier(resi) || 'spx';
    }

    let result;
    if (courier === 'spx') {
      result = await trackSPX(resi);
    } else {
      result = await trackBinderByte(resi, courier, env.BINDERBYTE_API_KEY);
    }

    return new Response(JSON.stringify(result), { headers: corsHeaders() });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: 'Server error' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/track' || url.pathname === '/api/track/') {
      return handleTrack(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
