import { useState, useCallback } from 'react'
import type { TasaCambio } from '../types'

export function useExchangeRates() {
  const [tasas, setTasas] = useState<TasaCambio>({
    bcv: null,
    binance: null,
    ultimaActualizacion: null,
  })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTasas = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [resBcv, resBinance] = await Promise.all([
        fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
        fetch('https://ve.dolarapi.com/v1/dolares/binance'),
      ])
      const bcvData = await resBcv.json()
      const binanceData = await resBinance.json()
      setTasas({
        bcv: Number(bcvData.promedio),
        binance: Number(binanceData.promedio),
        ultimaActualizacion: new Date().toLocaleString('es-VE'),
      })
    } catch {
      setError('No se pudo obtener las tasas. Ingresa los valores manualmente.')
    } finally {
      setCargando(false)
    }
  }, [])

  const setManual = useCallback((bcv: number, binance: number) => {
    setTasas({ bcv, binance, ultimaActualizacion: new Date().toLocaleString('es-VE') })
    setError(null)
  }, [])

  return { tasas, cargando, error, fetchTasas, setManual }
}
