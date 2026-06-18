export const config = { runtime: 'edge' };

function extractRate(data) {
  const candidates = [data.promedio, data.precio, data.price, data.ask, data.bid, data.rate, data.value, data.last];
  for (const v of candidates) {
    const n = Number(v);
    if (!isNaN(n) && n > 1) return n;
  }
  return null;
}

async function getRate(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const val = extractRate(data);
      if (val) return val;
    } catch { /* continúa */ }
  }
  return null;
}

export default async function handler() {
  const [bcv, binance] = await Promise.all([
    getRate([
      'https://ve.dolarapi.com/v1/dolares/oficial',
      'https://pydolarve.org/api/v1/dollar?monitor=bcv',
      'https://api.yadio.io/exrates/VES',
    ]),
    getRate([
      'https://ve.dolarapi.com/v1/dolares/binance',
      'https://pydolarve.org/api/v1/dollar?monitor=binance',
      'https://pydolarve.org/api/v1/dollar?monitor=enparalelovzla',
    ]),
  ]);

  return new Response(JSON.stringify({ bcv, binance }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
