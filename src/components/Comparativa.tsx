import { useState, useRef } from 'react';
import { Plus, Trash2, Check, Camera, Store, Scale, Search } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import { lookupBarcode } from '../utils/lookupBarcode';
import { supabase } from '../lib/supabase';
import { buscarPrecios, fetchCatalogoPorNombre, type HitPrecio } from '../hooks/useSync';
import { STORES } from '../constants/stores';
import StoreSelect from './StoreSelect';
import FotoProducto from './FotoProducto';

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
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const update = (id: string, field: keyof PropItem, value: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const addItem = () => {
    if (items.length < 3) setItems(prev => [...prev, newItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length > 2) setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleScan = async (id: string, code: string) => {
    setScanningId(null);
    setLoadingId(id);
    const name = await lookupBarcode(code);
    if (name) update(id, 'name', name);
    setLoadingId(null);
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

            <div className="flex gap-2">
              <input
                type="text"
                placeholder={loadingId === item.id ? 'Buscando...' : 'Nombre del producto (opcional)'}
                value={item.name}
                onChange={e => update(item.id, 'name', e.target.value)}
                disabled={loadingId === item.id}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={() => setScanningId(item.id)}
                className="bg-green-700 text-white rounded-xl px-3 py-2 hover:bg-green-600 transition-colors flex-shrink-0"
              >
                <Camera size={16} />
              </button>
            </div>

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

      {scanningId && (
        <BarcodeScanner
          onScan={code => handleScan(scanningId, code)}
          onClose={() => setScanningId(null)}
        />
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

  // Búsqueda por texto sobre el catálogo + los aportes de la comunidad.
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<HitPrecio[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  // Coincidencias del catálogo para el producto escaneado, cruzadas por nombre.
  const [hitsCodigo, setHitsCodigo] = useState<HitPrecio[] | null>(null);
  const busqueda = useRef(0);
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
    fetchPrices(code, name ?? undefined);
  };

  /** Búsqueda manual por código: también resuelve el nombre para cruzar el catálogo. */
  const buscarPorCodigo = async () => {
    const code = barcode.trim();
    if (!code) return;
    setLoadingLookup(true);
    const name = await lookupBarcode(code);
    setProductName(name || code);
    setLoadingLookup(false);
    fetchPrices(code, name ?? undefined);
  };

  /**
   * Precios para un código de barras.
   *
   * Los aportes de la comunidad se cruzan por el código, que es exacto. El
   * catálogo no tiene códigos de barras —los SKU son códigos internos de cada
   * cadena, no EAN— así que se busca por el nombre del producto, que es el
   * único puente disponible.
   */
  const fetchPrices = async (code: string, nombre?: string) => {
    setLoadingPrices(true);
    setHitsCodigo(null);
    try {
      // El cliente adjunta el JWT de la sesión, así RLS ve al usuario real.
      const { data, error } = await supabase
        .from('store_prices')
        .select('store,price_usd,recorded_at')
        .eq('barcode', code)
        .order('price_usd', { ascending: true });
      if (!error && data) setPrices(data);
    } catch { /* sin red */ }

    const paraBuscar = nombre?.trim();
    if (paraBuscar && paraBuscar !== code) {
      try {
        setHitsCodigo(await fetchCatalogoPorNombre(paraBuscar));
      } catch { /* sin red */ }
    }
    setLoadingPrices(false);
  };

  const savePrice = async () => {
    const price = parseFloat(newPrice);
    if (!barcode || isNaN(price) || price <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('store_prices')
        .upsert(
          { barcode, product_name: productName, store: selectedStore, price_usd: price },
          { onConflict: 'barcode,store' }
        );
      if (error) throw error;
      setNewPrice('');
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      fetchPrices(barcode);
    } catch { /* noop */ }
    setSaving(false);
  };

  const buscarTexto = async () => {
    const texto = query.trim();
    if (texto.length < 3) return;
    const id = ++busqueda.current;
    setBuscando(true);
    try {
      const res = await buscarPrecios(texto);
      if (busqueda.current !== id) return; // llegó tarde, ya hay otra búsqueda
      setHits(res);
    } catch {
      if (busqueda.current === id) setHits([]);
    } finally {
      if (busqueda.current === id) setBuscando(false);
    }
  };

  const minHit = hits && hits.length > 0 ? hits[0].precioUsd : null;

  const minPrice = prices.length > 0 ? Math.min(...prices.map(p => p.price_usd)) : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 px-1">
        Busca un producto por nombre para comparar su precio entre establecimientos,
        o escanea su código para consultar y registrar precios.
      </p>

      {/* Búsqueda por nombre en el catálogo */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto por nombre..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarTexto()}
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={buscarTexto}
            disabled={query.trim().length < 3 || buscando}
            className="bg-green-700 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {buscando ? '...' : 'Buscar'}
          </button>
        </div>

        {buscando && <p className="text-xs text-gray-400 text-center py-2">Buscando precios...</p>}

        {!buscando && hits !== null && hits.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">
            Sin resultados para «{query.trim()}». Prueba con menos palabras, por ejemplo
            solo la marca.
          </p>
        )}

        {!buscando && hits !== null && hits.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 px-1">
              {hits.length} {hits.length === 1 ? 'precio' : 'precios'} · del más barato al más caro
            </p>
            {hits.map((h, i) => (
              <div
                key={`${h.origen}-${h.establecimiento}-${h.nombre}-${i}`}
                className={`rounded-xl px-3 py-2.5 border flex items-start gap-2 ${
                  h.precioUsd === minHit ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-white'
                }`}
              >
                <FotoProducto url={h.urlImagen} alt={h.nombre} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{h.nombre}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-green-700">{h.establecimiento}</span>
                    {/* De dónde viene el dato: el catálogo se extrajo del sitio
                        del supermercado; «comunidad» lo aportó un usuario. */}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        h.origen === 'catalogo'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {h.origen === 'catalogo' ? 'Catálogo' : 'Comunidad'}
                    </span>
                    {h.presentacion && (
                      <span className="text-[10px] text-gray-400">{h.presentacion}</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-800 flex-shrink-0">
                  ${h.precioUsd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-3" />

      {/* Escanear */}
      <button
        onClick={() => setShowScanner(true)}
        className="w-full bg-brand-dark text-white rounded-full py-3 flex items-center justify-center gap-2 font-semibold text-sm hover:bg-brand-dark-hover transition-colors shadow-md"
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
          onClick={buscarPorCodigo}
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

          {/* Coincidencias del catálogo, cruzadas por nombre */}
          {hitsCodigo !== null && hitsCodigo.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                En el catálogo ({hitsCodigo.length})
              </p>
              <p className="text-[11px] text-gray-400 leading-snug -mt-1">
                Encontrados por nombre: el catálogo de los supermercados no publica
                códigos de barras, así que verifica que sea el mismo producto.
              </p>
              {hitsCodigo.map((h, i) => (
                <div
                  key={`cat-${h.establecimiento}-${i}`}
                  className="flex items-center justify-between rounded-xl px-4 py-2.5 border border-blue-100 bg-blue-50 gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FotoProducto url={h.urlImagen} alt={h.nombre} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{h.nombre}</p>
                      <p className="text-xs font-semibold text-blue-700 mt-0.5">{h.establecimiento}</p>
                    </div>
                  </div>
                  <span className="font-bold text-sm text-gray-800 flex-shrink-0 ml-2">
                    ${h.precioUsd.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Registrar precio nuevo */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Registrar precio</p>
            <StoreSelect value={selectedStore} onChange={setSelectedStore} variant="light" />
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
      <div className="bg-brand-dark-hover px-4 pt-3 pb-4 flex-shrink-0 space-y-3">
        <h2 className="text-white font-bold text-lg">Comparativa</h2>
        {/* Selector de modo */}
        <div className="flex bg-green-900 bg-opacity-60 rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode('proporciones')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'proporciones' ? 'bg-white text-brand-dark shadow-sm' : 'text-green-300'}`}
          >
            <Scale size={14} /> Por Proporciones
          </button>
          <button
            onClick={() => setMode('precios')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'precios' ? 'bg-white text-brand-dark shadow-sm' : 'text-green-300'}`}
          >
            <Store size={14} /> Por Establecimientos
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-brand-lime-soft">
        {mode === 'proporciones' ? <PropComparison /> : <PriceComparison />}
      </div>
    </div>
  );
}
