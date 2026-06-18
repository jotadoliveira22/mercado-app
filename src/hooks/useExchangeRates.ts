import { useState, useCallback, useEffect } from 'react';
import type { ExchangeRates } from '../types';

// Extrae un número positivo de cualquier campo conocido de una respuesta JSON
function extractRate(data: Record<string, unknown>): number | null {
  const candidates = [
    data.promedio, data.precio, data.price, data.ask, data.bid,
    data.rate, data.value, data.last, data.amount,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (!isNaN(n) && n > 1) return n; // tasas VES/USD siempre > 1
  }
  return null;
}

async function tryFetch(url: string, options?: RequestInit): Promise<number | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const data = await res.json();
    return extractRate(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function fetchBCV(): Promise<number | null> {
  const sources = [
    () => tryFetch('https://ve.dolarapi.com/v1/dolares/oficial'),
    () => tryFetch('https://pydolarve.org/api/v1/dollar?monitor=bcv'),
    () => tryFetch('https://api.exchangemonitor.net/v1/country/ve?coins=USD&monitors=bcv').then(async (v) => {
      if (v !== null) return v;
      // exchangemonitor returns nested structure
      try {
        const res = await fetch('https://api.exchangemonitor.net/v1/country/ve?coins=USD&monitors=bcv');
        if (!res.ok) return null;
        const data = await res.json();
        const monitor = data?.USD?.bcv ?? data?.bcv ?? null;
        if (monitor) return extractRate(monitor as Record<string, unknown>);
      } catch { /* noop */ }
      return null;
    }),
  ];

  for (const source of sources) {
    const val = await source();
    if (val !== null) return val;
  }
  return null;
}

async function fetchBinance(): Promise<number | null> {
  const sources = [
    () => tryFetch('https://ve.dolarapi.com/v1/dolares/binance'),
    () => tryFetch('https://pydolarve.org/api/v1/dollar?monitor=binance'),
    () => tryFetch('https://pydolarve.org/api/v1/dollar?monitor=enparalelovzla'),
    // Binance P2P directo — puede fallar por CORS pero vale el intento
    () => tryFetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiat: 'VES', page: 1, rows: 5, tradeType: 'BUY', asset: 'USDT',
        countries: [], proMerchantAds: false, shieldMerchantAds: false,
        filterType: 'all', periods: [], additionalKycVerifyFilter: 0,
        publisherType: null, payTypes: [], classifies: ['mass', 'profession'],
      }),
    }).then(async () => {
      // tryFetch no funciona aquí porque la estructura es anidada
      try {
        const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fiat: 'VES', page: 1, rows: 5, tradeType: 'BUY', asset: 'USDT',
            countries: [], proMerchantAds: false, shieldMerchantAds: false,
            filterType: 'all', periods: [], additionalKycVerifyFilter: 0,
            publisherType: null, payTypes: [], classifies: ['mass', 'profession'],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        for (const ad of (data?.data ?? [])) {
          const p = parseFloat(ad?.adv?.price);
          if (!isNaN(p) && p > 1) return p;
        }
      } catch { /* noop */ }
      return null;
    }),
  ];

  for (const source of sources) {
    const val = await source();
    if (val !== null) return val;
  }
  return null;
}

export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRates>({
    bcv: null,
    binance: null,
    lastUpdated: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bcv, binance] = await Promise.all([fetchBCV(), fetchBinance()]);

      if (bcv === null && binance === null) {
        setError('No se pudieron obtener las tasas. Ingrese manualmente.');
      } else if (binance === null) {
        setError('Tasa Binance no disponible. Ingrese manualmente.');
      } else if (bcv === null) {
        setError('Tasa BCV no disponible. Ingrese manualmente.');
      }

      setRates({ bcv, binance, lastUpdated: Date.now() });
    } catch {
      setError('Error de conexión. Ingrese las tasas manualmente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  return { rates, setRates, loading, error, fetchRates };
}
