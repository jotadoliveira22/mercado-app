import { useState, useCallback, useEffect } from 'react';
import type { ExchangeRates } from '../types';

export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRates>({
    bcv: null,
    usdt: null,
    lastUpdated: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rates');
      if (!res.ok) throw new Error();
      const data = await res.json() as { bcv: number | null; usdt: number | null };
      if (!data.bcv) setError('Tasa BCV no disponible. Ingrese manualmente.');
      setRates({ bcv: data.bcv, usdt: data.usdt, lastUpdated: Date.now() });
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  return { rates, setRates, loading, error, fetchRates };
}
