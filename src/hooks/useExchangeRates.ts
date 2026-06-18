import { useState, useCallback, useEffect } from 'react';
import type { ExchangeRates } from '../types';

async function fetchBCV(): Promise<number | null> {
  try {
    const res = await fetch('/api/rates');
    if (!res.ok) return null;
    const data = await res.json() as { bcv: number | null };
    return data.bcv ?? null;
  } catch {
    return null;
  }
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
      const bcv = await fetchBCV();
      if (!bcv) setError('Tasa BCV no disponible. Ingrese manualmente.');
      setRates(prev => ({ ...prev, bcv, lastUpdated: Date.now() }));
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  return { rates, setRates, loading, error, fetchRates };
}
