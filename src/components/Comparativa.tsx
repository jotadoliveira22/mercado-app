import { useState } from 'react';
import { GitCompare, Plus, Trash2, Check, Camera, Store, Scale } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import { lookupBarcode } from '../utils/lookupBarcode';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type CompareMode = 'proporciones' | 'precios';
type SizeUnit = 'g' | 'ml' | 'kg' | 'l';

interface PropItem {
  id: string;
  name: string;
  price: string;
  size: string;
  unit: SizeUnit;
}

const STORES = [
  'Supermercado Gama', 'Supermercado El Plaza', 'Central Madeirense',
  'Unicasa', 'Rio Vida', 'Supermercados RIO', 'Farmatodo',
  'Supermercado Forum', 'Supermercado Luz', 'Supermercado Páramo',
];

const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaHZ3cmF1a3FhZWJld3l0bWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDkxMDksImV4cCI6MjA5NzM4NTEwOX0.kEYjPlnlOoNy70GmRaJic7-FhMxuCb3jFidx1aKebhU';
const SB_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// Normaliza todo a gramos o mililitros para comparar
function toBaseUnit(size: number, unit: SizeUnit): number {
  if (unit === 'kg') return size * 1000;
  if (unit === 'l')  return size * 1000;
  return size; // g o ml ya están en base
}

function unitLabel(unit: SizeUnit): string {
  if (unit === 'kg' || unit === 'g') return 'g';
  return 'ml';
}

// ─── Comparativa por Proporciones ───────────────────────────────────────────

function newItem(): PropItem {
  return { id: crypto.randomUUID(), name: '', price: '', size: '', unit: 'g' };
}

function PropComparison() {
  const [items, setItems] = useState<PropItem[]>([newItem(), newItem()]);
  const [currency, setCurrency] = useState<'USD' | 'Bs'>('USD');

  const update = (id: string, field: keyof PropItem, value: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const addItem = () => {
    if (items.length < 3) setItems(prev => [...prev, newItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length > 2) setItems(prev => prev.filter(i => i.id !== id));
  };

  // Calcular precio por unidad mínima
  const results = items.map(item => {
    const price = parseFloat(item.price);
    const size = parseFloat(item.size);
    if (isNaN(price) || isNaN(size) || size === 0) return null;
    const base = toBaseUnit(size, item.unit);
    return { id: item.id, pricePerUnit: price / base, base, unit: unitLabel(item.unit) };
  });

  const validResults = results.filter(Boolean) as NonNullable<typeof results[0]>[];
  const minPrice = validResults.length > 0 ? Math.min(...validResults.map(r => r.pricePerUnit)) : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 px-1">
        Ingresa el precio y tamaño de cada producto para encontrar la mejor opción por unidad de medida.
      </p>

      {/* Moneda */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Moneda:</span>
        <div className="flex rounded-xl overflow-hidden border border-gray-300">
          {(['USD', 'Bs'] as const).map(c => (
            <button key={c} onClick={() => setCurrency(c)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${currency === c ? 'bg-green-700 text-white' : 'bg-white text-gray-600'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {items.map((item, idx) => {
        const result = results[idx];
        const isBest = result && minPrice !== null && Math.abs(result.pricePerUnit - minPrice) < 0.000001;
        return (
          <div key={item.id}
            className={`bg-white rounded-2xl border-2 p-4 space-y-3 transition-colors ${isBest && validResults.length > 1 ? 'border-green-500' : 'border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isBest && validResults.length > 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Producto {idx + 1}
              </span>
              {isBest && validResults.length > 1 && (
                <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                  <Check size={14} /> Mejor precio
                </span>
              )}
              {items.length > 2 && (
                <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-400 ml-auto">
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="Nombre del producto (opcional)"
              value={item.name}
              onChange={e => update(item.id, 'name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <div className="flex gap-2">
              {/* Precio */}
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{currency === 'USD' ? '$' : 'Bs'}</span>
                <input
                  type="number"
                  placeholder="Precio"
                  value={item.price}
                  onChange={e => update(item.id, 'price', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  min="0" step="0.01"
                />
              </div>
              {/* Tamaño */}
              <input
                type="number"
                placeholder="Tamaño"
                value={item.size}
                onChange={e => update(item.id, 'size', e.target.value)}
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                min="0" step="any"
              />
              {/* Unidad */}
              <select
                value={item.unit}
                onChange={e => update(item.id, 'unit', e.target.value as SizeUnit)}
                className="border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="kg">kg</option>
                <option value="l">L</option>
              </select>
            </div>

            {/* Resultado por unidad */}
            {result && (
              <div className={`rounded-xl px-3 py-2 text-xs font-medium ${isBest && validResults.length > 1 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                {currency === 'USD' ? '$' : 'Bs'}{result.pricePerUnit.toFixed(5)} por {result.unit}
              </div>
            )}
          </div>
        );
      })}

      {items.length < 3 && (
        <button onClick={addItem}
          className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-3 text-sm text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors flex items-center justify-center gap-2">
          <Plus size={16} /> Agregar tercer producto
        </button>
      )}
    </div>
  );
}

// ─── Comparativa por Precio (establecimientos) ──────────────────────────────

interface StorePrice {
  store: string;
  price_usd: number;
  recorded_at: string;
}

function PriceComparison() {
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [prices, setPrices] = useState<StorePrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selectedStore, setSelectedStore] = useState(STORES[0]);
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const handleScan = async (code: string) => {
    setShowScanner(false);
    setBarcode(code);
    setLoadingLookup(true);
    const name = await lookupBarcode(code);
    setProductName(name || code);
    setLoadingLookup(false);
    fetchPrices(code);
  };

  const fetchPrices = async (code: string) => {
    setLoadingPrices(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/store_prices?barcode=eq.${encodeURIComponent(code)}&order=price_usd.asc&select=store,price_usd,recorded_at`,
        { headers: SB_HEADERS }
      );
      if (res.ok) setPrices(await res.json());
    } catch { /* sin red */ }
    setLoadingPrices(false);
  };

  const savePrice = async () => {
    const price = parseFloat(newPrice);
    if (!barcode || isNaN(price) || price <= 0) return;
    setSaving(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/store_prices`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ barcode, product_name: productName, store: selectedStore, price_usd: price }),
      });
      setNewPrice('');
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      fetchPrices(barcode);
    } catch { /* noop */ }
    setSaving(false);
  };

  const minPrice = prices.length > 0 ? Math.min(...prices.map(p => p.price_usd)) : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 px-1">
        Escanea un producto y consulta o registra su precio en distintos establecimientos.
        Los precios son aportados por la comunidad.
      </p>

      {/* Escanear */}
      <button
        onClick={() => setShowScanner(true)}
        className="w-full bg-green-700 text-white rounded-2xl py-3 flex items-center justify-center gap-2 font-semibold text-sm hover:bg-green-600 transition-colors"
      >
        <Camera size={18} /> Escanear producto
      </button>

      {/* O ingresar código manual */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="O ingresa el código manualmente"
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={() => { if (barcode) { setProductName(barcode); fetchPrices(barcode); } }}
          className="bg-green-700 text-white rounded-xl px-4 py-2 text-sm hover:bg-green-600"
        >
          Buscar
        </button>
      </div>

      {loadingLookup && <p className="text-xs text-gray-400 text-center">Buscando producto...</p>}

      {productName && (
        <>
          {/* Nombre del producto */}
          <div className="bg-green-50 rounded-xl px-4 py-2">
            <p className="text-xs text-gray-500">Producto</p>
            <p className="text-sm font-semibold text-gray-800">{productName}</p>
            <p className="text-xs text-gray-400 font-mono">{barcode}</p>
          </div>

          {/* Precios registrados */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Precios registrados {loadingPrices ? '(cargando...)' : `(${prices.length})`}
            </p>
            {prices.length === 0 && !loadingPrices && (
              <p className="text-xs text-gray-400 text-center py-2">
                Sé el primero en registrar el precio de este producto
              </p>
            )}
            {prices.map(p => {
              const isBest = Math.abs(p.price_usd - (minPrice ?? 0)) < 0.001;
              const date = new Date(p.recorded_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
              return (
                <div key={`${p.store}-${p.recorded_at}`}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border-2 transition-colors ${isBest ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-white'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {isBest && <Check size={14} className="text-green-600 flex-shrink-0" />}
                    <Store size={14} className="text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${isBest ? 'text-green-700' : 'text-gray-700'}`}>{p.store}</p>
                      <p className="text-xs text-gray-400">{date}</p>
                    </div>
                  </div>
                  <span className={`font-bold text-sm flex-shrink-0 ml-2 ${isBest ? 'text-green-700' : 'text-gray-700'}`}>
                    ${p.price_usd.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Registrar precio nuevo */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Registrar precio</p>
            <select
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {STORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  type="number"
                  placeholder="Precio en USD"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && savePrice()}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  min="0" step="0.01"
                />
              </div>
              <button
                onClick={savePrice}
                disabled={saving || !newPrice}
                className="bg-green-700 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-green-600 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {saving ? '...' : savedOk ? '✓' : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      )}

      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Comparativa() {
  const [mode, setMode] = useState<CompareMode>('proporciones');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-green-700 px-4 py-4 shadow-md flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <GitCompare className="text-white" size={22} />
          <h1 className="text-white font-bold text-xl">Comparativa</h1>
        </div>
        {/* Selector de modo */}
        <div className="flex bg-green-600 rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode('proporciones')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${mode === 'proporciones' ? 'bg-white text-green-700' : 'text-white'}`}
          >
            <Scale size={14} /> Por Proporciones
          </button>
          <button
            onClick={() => setMode('precios')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${mode === 'precios' ? 'bg-white text-green-700' : 'text-white'}`}
          >
            <Store size={14} /> Por Establecimientos
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {mode === 'proporciones' ? <PropComparison /> : <PriceComparison />}
      </div>
    </div>
  );
}
