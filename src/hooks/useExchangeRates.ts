import { useState, useCallback, useEffect } from 'react';
import type { ExchangeRates } from '../types';

// Binance P2P: mismo endpoint que usa el script de Google Sheets
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// BCV via proxy CORS público (bcv.org.ve bloquea CORS directo desde browser)
const BCV_PROXY_URLS = [
  'https://ve.dolarapi.com/v1/dolares/oficial',
  'https://pydolarve.org/api/v1/dollar?monitor=bcv',
];

const BINANCE_PROXY_URLS = [
  'https://ve.dolarapi.com/v1/dolares/binance',
  'https://pydolarve.org/api/v1/dollar?monitor=binance',
];

async function fetchBCV(): Promise<number | null> {
  // Intento 1: dolarapi
  try {
    const res = await fetch(BCV_PROXY_URLS[0]);
    if (res.ok) {
      const data = await res.json();
      const val = data.promedio ?? data.precio ?? null;
      if (val && val > 0) return Number(val);
    }
  } catch { /* continúa */ }

  // Intento 2: pydolarve
  try {
    const res = await fetch(BCV_PROXY_URLS[1]);
    if (res.ok) {
      const data = await res.json();
      const val = data.price ?? data.promedio ?? null;
      if (val && val > 0) return Number(val);
    }
  } catch { /* continúa */ }

  // Intento 3: Binance P2P directo para obtener el precio de mercado
  return null;
}

async function fetchBinanceP2P(): Promise<number | null> {
  // Intento 1: dolarapi
  try {
    const res = await fetch(BINANCE_PROXY_URLS[0]);
    if (res.ok) {
      const data = await res.json();
      const val = data.promedio ?? data.precio ?? null;
      if (val && val > 0) return Number(val);
    }
  } catch { /* continúa */ }

  // Intento 2: pydolarve
  try {
    const res = await fetch(BINANCE_PROXY_URLS[1]);
    if (res.ok) {
      const data = await res.json();
      const val = data.price ?? data.promedio ?? null;
      if (val && val > 0) return Number(val);
    }
  } catch { /* continúa */ }

  // Intento 3: Binance P2P directo (mismo que el Google Apps Script)
  try {
    const res = await fetch(BINANCE_P2P_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiat: 'VES',
        page: 1,
        rows: 10,
        tradeType: 'BUY',
        asset: 'USDT',
        countries: [],
        proMerchantAds: false,
        shieldMerchantAds: false,
        filterType: 'all',
        periods: [],
        additionalKycVerifyFilter: 0,
        publisherType: null,
        payTypes: [],
        classifies: ['mass', 'profession'],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const ads = data?.data ?? [];
      for (const ad of ads) {
        const price = parseFloat(ad?.adv?.price);
        if (!isNaN(price) && price > 0) return price;
      }
    }
  } catch { /* continúa */ }

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
      const [bcv, binance] = await Promise.all([fetchBCV(), fetchBinanceP2P()]);

      if (bcv === null && binance === null) {
        setError('No se pudieron obtener las tasas. Ingrese manualmente.');
      } else if (bcv === null) {
        setError('Tasa BCV no disponible. Ingrese manualmente.');
      } else if (binance === null) {
        setError('Tasa Binance no disponible. Ingrese manualmente.');
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
