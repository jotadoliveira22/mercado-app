import { useState, useCallback } from 'react';
import type { ExchangeRates } from '../types';

const BCV_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const BINANCE_URL = 'https://ve.dolarapi.com/v1/dolares/binance';

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
      const [bcvRes, binanceRes] = await Promise.allSettled([
        fetch(BCV_URL),
        fetch(BINANCE_URL),
      ]);

      let bcv: number | null = null;
      let binance: number | null = null;

      if (bcvRes.status === 'fulfilled' && bcvRes.value.ok) {
        const data = await bcvRes.value.json();
        bcv = data.promedio ?? data.precio ?? null;
      }

      if (binanceRes.status === 'fulfilled' && binanceRes.value.ok) {
        const data = await binanceRes.value.json();
        binance = data.promedio ?? data.precio ?? null;
      }

      if (bcv === null && binance === null) {
        setError('No se pudieron obtener las tasas. Ingrese manualmente.');
      }

      setRates({ bcv, binance, lastUpdated: Date.now() });
    } catch {
      setError('Error de conexión. Ingrese las tasas manualmente.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { rates, setRates, loading, error, fetchRates };
}
