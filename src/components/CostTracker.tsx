import { useState, useEffect } from 'react'
import { Plus, Trash2, ScanLine, RefreshCw, Edit2, Check, X, DollarSign, AlertCircle } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useExchangeRates } from '../hooks/useExchangeRates'
import BarcodeScanner from './BarcodeScanner'
import type { ItemCosto } from '../types'

export default function CostTracker() {
  const [items, setItems] = useLocalStorage<ItemCosto[]>('costo-mercado', [])
  const { tasas, cargando, error, fetchTasas, setManual } = useExchangeRates()
  const [mostrarScanner, setMostrarScanner] = useState(false)
  const [buscarBarcode, setBuscarBarcode] = useState(false)

  const [form, setForm] = useState({ nombre: '', cantidad: 1, precio: '' })
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', cantidad: 1, precio: '' })

  const [bcvManual, setBcvManual] = useState('')
  const [binanceManual, setBinanceManual] = useState('')
  const [mostrarManual, setMostrarManual] = useState(false)

  useEffect(() => {
    fetchTasas()
  }, [fetchTasas])

  const totalUSD = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0)

  const handleScan = async (codigo: string) => {
    setMostrarScanner(false)
    setBuscarBarcode(true)
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${codigo}.json`)
      const data = await res.json()
      const nombre =
        data?.product?.product_name_es ||
        data?.product?.product_name ||
        codigo
      setForm((f) => ({ ...f, nombre, precio: '' }))
    } catch {
      setForm((f) => ({ ...f, nombre: codigo, precio: '' }))
    } finally {
      setBuscarBarcode(false)
    }
  }

  const agregar = () => {
    const nombre = form.nombre.trim()
    const precio = parseFloat(form.precio)
    if (!nombre || isNaN(precio) || precio < 0) return
    const nuevo: ItemCosto = {
      id: crypto.randomUUID(),
      nombre,
      cantidad: form.cantidad,
      precioUnitario: precio,
    }
    setItems((prev) => [...prev, nuevo])
    setForm({ nombre: '', cantidad: 1, precio: '' })
  }

  const eliminar = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  const iniciarEdicion = (item: ItemCosto) => {
    setEditandoId(item.id)
    setEditForm({ nombre: item.nombre, cantidad: item.cantidad, precio: String(item.precioUnitario) })
  }

  const guardarEdicion = (id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, nombre: editForm.nombre, cantidad: editForm.cantidad, precioUnitario: parseFloat(editForm.precio) || 0 }
          : i,
      ),
    )
    setEditandoId(null)
  }

  const aplicarManual = () => {
    const bcv = parseFloat(bcvManual)
    const binance = parseFloat(binanceManual)
    if (!isNaN(bcv) && !isNaN(binance)) {
      setManual(bcv, binance)
      setMostrarManual(false)
    }
  }

  const limpiar = () => {
    if (confirm('¿Eliminar todos los productos del mercado?')) setItems([])
  }

  const fmt = (n: number, decimals = 2) =>
    n.toLocaleString('es-VE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  return (
    <div className="flex flex-col h-full">
      {/* Scanner modal */}
      {mostrarScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setMostrarScanner(false)} />
      )}

      {/* Header con totales */}
      <div className="bg-green-700 text-white px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={22} />
          <h1 className="text-lg font-bold">Calculadora de Mercado</h1>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-800 rounded-xl p-3 text-center">
            <p className="text-green-300 text-xs mb-1">Total USD</p>
            <p className="text-white font-bold text-lg">${fmt(totalUSD)}</p>
          </div>
          <div className="bg-green-800 rounded-xl p-3 text-center">
            <p className="text-green-300 text-xs mb-1">Bs BCV</p>
            <p className="text-white font-bold text-base">
              {tasas.bcv ? `Bs ${fmt(totalUSD * tasas.bcv, 0)}` : '—'}
            </p>
          </div>
          <div className="bg-green-800 rounded-xl p-3 text-center">
            <p className="text-green-300 text-xs mb-1">Bs Binance</p>
            <p className="text-white font-bold text-base">
              {tasas.binance ? `Bs ${fmt(totalUSD * tasas.binance, 0)}` : '—'}
            </p>
          </div>
        </div>

        {/* Tasas */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-green-300 text-xs">
            {tasas.bcv && tasas.binance ? (
              <span>BCV: Bs {fmt(tasas.bcv)} · Binance: Bs {fmt(tasas.binance)}</span>
            ) : (
              <span>Sin tasas cargadas</span>
            )}
            {tasas.ultimaActualizacion && (
              <span className="block opacity-70">Act: {tasas.ultimaActualizacion}</span>
            )}
          </div>
          <button
            onClick={fetchTasas}
            disabled={cargando}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-500 px-2 py-1 rounded-lg text-xs text-white disabled:opacity-50"
          >
            <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Error de tasas */}
      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <div className="flex items-start gap-2 text-amber-700 text-xs mb-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {!mostrarManual ? (
            <button onClick={() => setMostrarManual(true)} className="text-xs text-amber-600 underline">
              Ingresar tasas manualmente
            </button>
          ) : (
            <div className="flex gap-2 items-end mt-1">
              <div>
                <label className="text-xs text-amber-600">BCV (Bs/$)</label>
                <input type="number" className="block border rounded px-2 py-1 text-sm w-24" value={bcvManual} onChange={(e) => setBcvManual(e.target.value)} placeholder="ej: 50" />
              </div>
              <div>
                <label className="text-xs text-amber-600">Binance (Bs/$)</label>
                <input type="number" className="block border rounded px-2 py-1 text-sm w-24" value={binanceManual} onChange={(e) => setBinanceManual(e.target.value)} placeholder="ej: 52" />
              </div>
              <button onClick={aplicarManual} className="bg-amber-500 text-white px-3 py-1 rounded text-sm">OK</button>
            </div>
          )}
        </div>
      )}

      {/* Formulario agregar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            placeholder={buscarBarcode ? 'Buscando producto...' : 'Nombre del producto'}
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={buscarBarcode}
          />
          <button
            onClick={() => setMostrarScanner(true)}
            className="bg-green-100 hover:bg-green-200 text-green-700 rounded-xl px-3 py-2 flex items-center"
            title="Escanear código de barras"
          >
            <ScanLine size={20} />
          </button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 ml-1">Cantidad</label>
              <input
                type="number"
                min={1}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                value={form.cantidad}
                onChange={(e) => setForm((f) => ({ ...f, cantidad: Math.max(1, Number(e.target.value)) }))}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 ml-1">Precio (USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                placeholder="0.00"
                value={form.precio}
                onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && agregar()}
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={agregar}
              className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2 flex items-center gap-1 text-sm font-medium"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="flex-1 overflow-y-auto pb-4">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ScanLine size={56} className="mb-3 opacity-30" />
            <p className="text-sm">Sin productos registrados</p>
            <p className="text-xs mt-1">Agrega productos o escanea un código</p>
          </div>
        )}

        <div className="mt-2 mx-3 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-gray-100 rounded-xl px-3 py-3">
              {editandoId === item.id ? (
                <div className="space-y-2">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-green-500"
                    value={editForm.nombre}
                    onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-green-500"
                      value={editForm.cantidad}
                      onChange={(e) => setEditForm((f) => ({ ...f, cantidad: Number(e.target.value) }))}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-green-500"
                      value={editForm.precio}
                      onChange={(e) => setEditForm((f) => ({ ...f, precio: e.target.value }))}
                    />
                    <button onClick={() => guardarEdicion(item.id)} className="text-green-600 p-1"><Check size={18} /></button>
                    <button onClick={() => setEditandoId(null)} className="text-gray-400 p-1"><X size={18} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.nombre}</p>
                    <p className="text-xs text-gray-400">
                      {item.cantidad} x ${fmt(item.precioUnitario)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-green-700">${fmt(item.cantidad * item.precioUnitario)}</p>
                    {tasas.bcv && (
                      <p className="text-xs text-gray-400">
                        Bs {fmt(item.cantidad * item.precioUnitario * tasas.bcv, 0)}
                      </p>
                    )}
                  </div>
                  <button onClick={() => iniciarEdicion(item)} className="text-gray-300 hover:text-blue-400 p-1 ml-1">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => eliminar(item.id)} className="text-gray-300 hover:text-red-400 p-1">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="px-4 mt-4 space-y-2">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{items.length} producto{items.length > 1 ? 's' : ''}</span>
                <span className="font-bold text-green-700">${fmt(totalUSD)} USD</span>
              </div>
              {tasas.bcv && (
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>BCV</span>
                  <span>Bs {fmt(totalUSD * tasas.bcv, 0)}</span>
                </div>
              )}
              {tasas.binance && (
                <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                  <span>Binance</span>
                  <span>Bs {fmt(totalUSD * tasas.binance, 0)}</span>
                </div>
              )}
            </div>
            <button onClick={limpiar} className="w-full py-2 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50">
              Limpiar mercado
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
