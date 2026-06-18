import { useState, useCallback, useEffect } from 'react';
import type { ExchangeRates } from '../types';

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
      const res = await fetch('/api/rates');
      if (!res.ok) throw new Error('Error al obtener tasas');
      const data = await res.json() as { bcv: number | null; binance: number | null };

      if (!data.bcv && !data.binance) {
        setError('No se pudieron obtener las tasas. Ingrese manualmente.');
      } else if (!data.binance) {
        setError('Tasa Binance no disponible. Ingrese manualmente.');
      } else if (!data.bcv) {
        setError('Tasa BCV no disponible. Ingrese manualmente.');
      }

      setRates({ bcv: data.bcv, binance: data.binance, lastUpdated: Date.now() });
    } catch {
      setError('Error de conexión. Ingrese las tasas manualmente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  return { rates, setRates, loading, error, fetchRates };
}
