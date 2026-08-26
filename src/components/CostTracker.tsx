import { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Camera, DollarSign, AlertCircle, CreditCard, Save, Search } from 'lucide-react';
import type { TrackerItem, ExchangeRates, Unit, SavedPurchase } from '../types';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { pushPricesToComparative, fetchCatalogoDeTienda, fetchStorePrices } from '../hooks/useSync';
import { mejorCoincidencia, type CandidatoCatalogo } from '../utils/matchProducto';
import { priceKeyCandidates } from '../utils/priceKey';
import { cantidadFacturable, formatearPeso } from '../utils/pesosUnitarios';

type OrigenPrecio = 'comunidad' | 'catalogo';

interface Props {
  trackerItems: TrackerItem[];
  setTrackerItems: (val: TrackerItem[] | ((prev: TrackerItem[]) => TrackerItem[])) => void;
  savedPurchases: SavedPurchase[];
  setSavedPurchases: (val: SavedPurchase[] | ((prev: SavedPurchase[]) => SavedPurchase[])) => void;
}
import { lookupBarcode } from '../utils/lookupBarcode';
import { categorizeProduct } from '../utils/categorize';
import BarcodeScanner from './BarcodeScanner';
import NewProductModal from './NewProductModal';
import StoreSelect from './StoreSelect';
import BuscadorCatalogo from './BuscadorCatalogo';
import FotoProducto from './FotoProducto';

type CasheaRate = 20 | 40;

function UnitToggle({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-gray-300 flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange('Und')}
        className={`px-3 py-2 text-sm font-medium transition-colors ${value === 'Und' ? 'bg-green-700 text-white' : 'bg-white text-gray-600'}`}
      >
        Und
      </button>
      <button
        type="button"
        onClick={() => onChange('Kg')}
        className={`px-3 py-2 text-sm font-medium transition-colors ${value === 'Kg' ? 'bg-green-700 text-white' : 'bg-white text-gray-600'}`}
      >
        Kg
      </button>
    </div>
  );
}

export default function CostTracker({ trackerItems: items, setTrackerItems: setItems, setSavedPurchases }: Props) {
  const { rates, setRates, loading, error, fetchRates } = useExchangeRates();
  const [savedMsg, setSavedMsg] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [manualBcv, setManualBcv] = useState('');
  const [manualUsdt, setManualUsdt] = useState('');
  const [casheaRate, setCasheaRate] = useState<CasheaRate>(20);
  const [showCashea, setShowCashea] = useState(false);

  const [selectedStore, setSelectedStore] = useState('');
  // Catálogo del establecimiento, para el buscador y el autocompletado de
  // precio. Se carga al elegir tienda.
  const [catalogo, setCatalogo] = useState<CandidatoCatalogo[]>([]);
  // Precios aportados por la comunidad (por código de barras), misma fuente
  // que usa la Lista. Se prefieren sobre el catálogo por ser exactos.
  const [preciosComunidad, setPreciosComunidad] = useState<Map<string, number>>(new Map());
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [showBuscador, setShowBuscador] = useState(false);
  const pedidoCatalogo = useRef(0);

  const [form, setForm] = useState({ name: '', quantity: '', unitPrice: '', unit: 'Und' as Unit });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '1', unitPrice: '', unit: 'Und' as Unit });
  const [loadingProduct, setLoadingProduct] = useState(false);
  // Código del último escaneo, para guardarlo junto al producto.
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(undefined);
  // De dónde salió el precio que está en el formulario ahora mismo, para
  // avisarle al usuario que lo revise en vez de dar por hecho que es exacto.
  // Se borra en cuanto el usuario toca el campo de precio a mano.
  const [precioOrigen, setPrecioOrigen] = useState<OrigenPrecio | null>(null);
  // Kg weight accumulator
  const [kgParcials, setKgParcials] = useState<number[]>([]);
  const kgInputRef = useRef<HTMLInputElement>(null);

  const cambiarTienda = useCallback(async (next: string) => {
    const pedido = ++pedidoCatalogo.current;
    setSelectedStore(next);
    setCatalogo([]);
    setPreciosComunidad(new Map());
    if (!next) return;
    setCargandoCatalogo(true);
    const [cat, precios] = await Promise.all([
      fetchCatalogoDeTienda(next),
      fetchStorePrices(next),
    ]);
    if (pedidoCatalogo.current !== pedido) return; // llegó tarde, ya hay otro
    setCatalogo(cat);
    setPreciosComunidad(precios ?? new Map());
    setCargandoCatalogo(false);
  }, []);

  /**
   * Precio conocido para un producto en el establecimiento elegido, o null.
   *
   * Primero los aportes de la comunidad, que se cruzan por código de barras y
   * por tanto son exactos. Si no hay, se busca en el catálogo por nombre —
   * mismo orden de prioridad que usa la Lista, para que el precio que ve el
   * usuario no dependa de en qué pantalla esté.
   */
  const resolverPrecio = useCallback((nombre: string, barcode?: string): { precio: number; origen: OrigenPrecio } | null => {
    if (barcode) {
      for (const key of priceKeyCandidates({ barcode, name: nombre })) {
        const found = preciosComunidad.get(key);
        if (found !== undefined) return { precio: found, origen: 'comunidad' };
      }
    }
    const m = mejorCoincidencia(nombre, catalogo);
    if (m) return { precio: m.candidato.precio, origen: 'catalogo' };
    return null;
  }, [preciosComunidad, catalogo]);

  /**
   * Rellena el precio si se conoce y el usuario no lo ha tocado a mano.
   *
   * Es el corazón de la mejora: el usuario escanea o escribe el nombre, y si
   * ya sabemos el precio no tiene que teclearlo — solo confirmarlo o
   * corregirlo si cambió. Nunca pisa un precio que el usuario ya escribió.
   */
  const autocompletarPrecio = useCallback((nombre: string, barcode?: string) => {
    if (!nombre.trim() || !selectedStore) return;
    const resuelto = resolverPrecio(nombre, barcode);
    if (!resuelto) { setPrecioOrigen(null); return; }
    let aplicado = false;
    setForm(prev => {
      // No pisa un precio que el usuario ya haya escrito a mano: solo rellena
      // cuando el campo está vacío o el precio actual también vino de aquí.
      if (prev.unitPrice.trim() && precioOrigen === null) return prev;
      aplicado = true;
      return { ...prev, unitPrice: String(resuelto.precio) };
    });
    if (aplicado) setPrecioOrigen(resuelto.origen);
  }, [selectedStore, resolverPrecio, precioOrigen]);

  /**
   * Producto elegido del buscador: rellena nombre y precio del catálogo.
   *
   * El precio queda editable a propósito: los del catálogo tienen fecha de
   * extracción y en la tienda puede costar distinto. Se ahorra el tecleo sin
   * afirmar que ese es el precio de hoy.
   */
  const usarDelCatalogo = (producto: CandidatoCatalogo) => {
    setShowBuscador(false);
    setScannedBarcode(undefined);
    setPrecioOrigen('catalogo');
    setForm(prev => ({
      ...prev,
      name: producto.nombre,
      unitPrice: String(producto.precio),
      quantity: prev.quantity || '1',
    }));
  };

  // Un producto por kilo se cobra por kilo aunque el usuario lo cuente en
  // piezas, así que la cantidad facturable puede no ser la que escribió.
  const totalUSD = items.reduce(
    (sum, i) => sum + cantidadFacturable(i.name, i.quantity, i.unit ?? 'Und').cantidad * i.unitPrice,
    0,
  );
  // Productos traídos de la Lista sin precio registrado, pendientes de completar.
  const missingPriceCount = items.filter(i => !(i.unitPrice > 0)).length;
  const totalBs = rates.bcv ? totalUSD * rates.bcv : null;
  // USDT = Bs BCV ÷ tasa USDT (dólar paralelo)
  const totalUSDT = totalBs && rates.usdt ? totalBs / rates.usdt : null;
  const casheaUSD = totalUSD * (casheaRate / 100);
  const casheaBs = rates.bcv ? casheaUSD * rates.bcv : null;
  const casheaUSDT = casheaBs && rates.usdt ? casheaBs / rates.usdt : null;

  const handleScan = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setLoadingProduct(true);
    const name = await lookupBarcode(barcode);
    setLoadingProduct(false);
    // Se conserva el código: es lo que hace exacto el cruce de precios.
    setScannedBarcode(barcode);
    if (name) {
      setForm(prev => ({ ...prev, name }));
      autocompletarPrecio(name, barcode);
    } else {
      setUnknownBarcode(barcode);
    }
  }, [autocompletarPrecio]);

  const kgTotal = kgParcials.reduce((s, v) => s + v, 0);

  const addKgParcial = () => {
    const v = parseFloat(parseFloat(form.quantity).toFixed(3));
    if (isNaN(v) || v <= 0) return;
    setKgParcials(prev => [...prev, v]);
    setForm(prev => ({ ...prev, quantity: '' }));
    kgInputRef.current?.focus();
  };

  const removeKgParcial = (idx: number) =>
    setKgParcials(prev => prev.filter((_, i) => i !== idx));

  const addItem = () => {
    const name = form.name.trim();
    const unitPrice = parseFloat(form.unitPrice);
    let quantity: number;
    if (form.unit === 'Kg') {
      const inputVal = parseFloat(form.quantity) || 0;
      const accumulated = parseFloat((kgTotal + (inputVal > 0 ? inputVal : 0)).toFixed(3));
      quantity = accumulated > 0 ? accumulated : 0;
    } else {
      quantity = parseFloat(form.quantity);
    }
    if (!name || isNaN(quantity) || isNaN(unitPrice) || quantity <= 0 || unitPrice < 0) return;
    setItems(prev => [...prev, {
      id: crypto.randomUUID(), name, quantity, unitPrice,
      unit: form.unit, category: categorizeProduct(name),
      barcode: scannedBarcode,
    }]);
    setForm({ name: '', quantity: '', unitPrice: '', unit: form.unit });
    setKgParcials([]);
    setScannedBarcode(undefined);
    setPrecioOrigen(null);
  };

  const savePurchase = () => {
    if (items.length === 0) return;
    if (!selectedStore) return;
    const enrichedItems = items.map(i => ({ ...i, category: i.category ?? categorizeProduct(i.name) }));
    const purchase: SavedPurchase = {
      id: crypto.randomUUID(),
      date: Date.now(),
      items: enrichedItems,
      totalUSD,
      totalBCV: rates.bcv ? totalUSD * rates.bcv : null,
      totalBinance: totalUSDT,
      store: selectedStore,
    };
    setSavedPurchases(prev => [...prev, purchase]);
    pushPricesToComparative(enrichedItems, selectedStore).catch(() => {});
    setItems([]);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const deleteItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const startEdit = (item: TrackerItem) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, quantity: String(item.quantity), unitPrice: String(item.unitPrice), unit: item.unit ?? 'Und' });
  };

  const saveEdit = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      name: editForm.name.trim() || i.name,
      quantity: parseFloat(editForm.quantity) || i.quantity,
      unitPrice: parseFloat(editForm.unitPrice) ?? i.unitPrice,
      unit: editForm.unit,
    } : i));
    setEditingId(null);
  };

  const applyUsdt = () => {
    const b = parseFloat(manualUsdt);
    if (!isNaN(b) && b > 0) {
      setRates((prev: ExchangeRates) => ({ ...prev, usdt: b, lastUpdated: Date.now() }));
      setManualUsdt('');
    }
  };

  const applyBcv = () => {
    const b = parseFloat(manualBcv);
    if (!isNaN(b) && b > 0) {
      setRates((prev: ExchangeRates) => ({ ...prev, bcv: b, lastUpdated: Date.now() }));
      setManualBcv('');
    }
  };

  const formatBs = (usd: number, rate: number | null) => {
    if (!rate) return '—';
    return (usd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Subheader + totals */}
      <div className="bg-brand-dark-hover px-4 pt-3 pb-4 space-y-3">
        <h2 className="text-white font-bold text-lg">Carrito de Compras</h2>

        {/* Selector de establecimiento */}
        <StoreSelect value={selectedStore} onChange={cambiarTienda} />
        {!selectedStore && (
          <p className="text-green-200 text-xs -mt-1.5">
            Elige el establecimiento para que el precio se rellene solo al escanear.
          </p>
        )}

        {/* Total cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl px-3 py-3 text-center shadow-sm">
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide">Total USD</p>
            <p className="text-brand-dark font-extrabold text-base mt-0.5">${totalUSD.toFixed(2)}</p>
          </div>
          <div className="bg-brand-dark rounded-2xl px-3 py-3 text-center shadow-sm">
            <p className="text-green-300 text-[10px] font-semibold uppercase tracking-wide">BCV</p>
            <p className="text-white font-extrabold text-sm mt-0.5">Bs {formatBs(totalUSD, rates.bcv)}</p>
          </div>
          <div className="bg-[#15803d] rounded-2xl px-3 py-3 text-center shadow-sm">
            <p className="text-green-200 text-[10px] font-semibold uppercase tracking-wide">USDT</p>
            <p className="text-white font-extrabold text-sm mt-0.5">{totalUSDT ? totalUSDT.toFixed(4) + ' $' : '—'}</p>
          </div>
        </div>

        {/* Cashea toggle */}
        <button
          onClick={() => setShowCashea(v => !v)}
          className="w-full flex items-center justify-between bg-green-800 bg-opacity-60 border border-green-600 rounded-xl px-4 py-2.5 transition-colors hover:bg-green-700"
        >
          <div className="flex items-center gap-2">
            <CreditCard size={15} className="text-green-300" />
            <span className="text-white text-sm font-semibold">Inicial Cashea</span>
          </div>
          <span className="text-green-400 text-xs">{showCashea ? '▲' : '▼'}</span>
        </button>

        {/* Cashea panel */}
        {showCashea && (
          <div className="bg-green-900 bg-opacity-50 border border-green-700 rounded-2xl px-3 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-300 text-xs font-medium">Inicial:</span>
              <div className="flex rounded-lg overflow-hidden border border-green-600">
                {([20, 40] as CasheaRate[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setCasheaRate(r)}
                    className={`px-4 py-1 text-sm font-bold transition-colors ${casheaRate === r ? 'bg-white text-brand-dark' : 'text-white hover:bg-green-700'}`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-xl px-2 py-2 text-center">
                <p className="text-gray-500 text-[10px] font-semibold">USD</p>
                <p className="text-brand-dark font-bold text-sm">${casheaUSD.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-xl px-2 py-2 text-center">
                <p className="text-gray-500 text-[10px] font-semibold">BCV</p>
                <p className="text-brand-dark font-bold text-sm">Bs {formatBs(casheaUSD, rates.bcv)}</p>
              </div>
              <div className="bg-white rounded-xl px-2 py-2 text-center">
                <p className="text-gray-500 text-[10px] font-semibold">USDT</p>
                <p className="text-brand-dark font-bold text-sm">{casheaUSDT ? casheaUSDT.toFixed(4) + ' $' : '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rate bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16 flex-shrink-0">BCV:</span>
          {rates.bcv ? (
            <span className="text-xs font-semibold text-gray-800 flex-1">Bs {rates.bcv.toFixed(2)}</span>
          ) : (
            <div className="flex flex-1 gap-1">
              <input
                type="number"
                placeholder="Tasa BCV"
                value={manualBcv}
                onChange={e => setManualBcv(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyBcv()}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
              <button onClick={applyBcv} className="bg-green-700 text-white rounded-lg px-2 py-1 text-xs">OK</button>
            </div>
          )}
          <button onClick={fetchRates} disabled={loading} className="text-green-700 disabled:opacity-50 flex-shrink-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16 flex-shrink-0">USDT:</span>
          {rates.usdt ? (
            <span className="text-xs font-semibold text-gray-800 flex-1">Bs {rates.usdt.toFixed(2)}</span>
          ) : (
            <div className="flex flex-1 gap-1">
              <input
                type="number"
                placeholder="Tasa USDT"
                value={manualUsdt}
                onChange={e => setManualUsdt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyUsdt()}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
              <button onClick={applyUsdt} className="bg-green-700 text-white rounded-lg px-2 py-1 text-xs">OK</button>
            </div>
          )}
        </div>
        {error && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle size={12} /><span>{error}</span>
          </div>
        )}
      </div>

      {/* Add product form */}
      <div className="px-4 py-3 bg-brand-lime-soft border-b border-gray-100 space-y-2">
        {/* Row 1: name + camera */}
        <div className="flex gap-2">
          <input
            type="text"
            value={loadingProduct ? 'Buscando producto...' : form.name}
            onChange={e => {
              setForm(prev => ({ ...prev, name: e.target.value }));
              // Editar el nombre a mano desliga el código escaneado: pegarlo a
              // otro producto ensuciaría los precios compartidos.
              setScannedBarcode(undefined);
              setPrecioOrigen(null);
            }}
            onBlur={e => autocompletarPrecio(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Nombre del producto"
            disabled={loadingProduct}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={() => setShowBuscador(true)}
            disabled={!selectedStore}
            title={selectedStore ? 'Buscar en el catálogo' : 'Selecciona un establecimiento para buscar'}
            className="bg-green-700 text-white rounded-xl px-3 py-2 hover:bg-green-600 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Search size={18} />
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="bg-green-700 text-white rounded-xl px-3 py-2 hover:bg-green-600 transition-colors flex-shrink-0"
          >
            <Camera size={18} />
          </button>
        </div>

        {/* Row 2: qty | und/kg | price | add */}
        <div className="flex gap-2 items-center">
          <input
            ref={kgInputRef}
            type="number"
            value={form.quantity}
            onChange={e => setForm(prev => ({ ...prev, quantity: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (form.unit === 'Kg') addKgParcial();
                else addItem();
              }
            }}
            placeholder={form.unit === 'Kg' ? '0.000' : 'Cant.'}
            min="0.001"
            step="0.001"
            className="w-20 border border-gray-300 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
          />
          {/* Kg: button to accumulate parcel */}
          {form.unit === 'Kg' && (
            <button
              type="button"
              onClick={addKgParcial}
              title="Sumar peso"
              className="bg-blue-500 text-white rounded-xl px-2.5 py-2 hover:bg-blue-600 transition-colors flex-shrink-0 font-bold text-sm"
            >
              +Kg
            </button>
          )}
          <UnitToggle value={form.unit} onChange={u => { setForm(prev => ({ ...prev, unit: u, quantity: '' })); setKgParcials([]); }} />
          <input
            type="number"
            value={form.unitPrice}
            onChange={e => {
              setForm(prev => ({ ...prev, unitPrice: e.target.value }));
              // El usuario tomó el control del precio: ya no es "sugerido".
              setPrecioOrigen(null);
            }}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Precio $"
            min="0"
            step="0.01"
            className={`flex-1 min-w-0 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
              precioOrigen ? 'border-green-400 bg-green-50' : 'border-gray-300'
            }`}
          />
          <button
            onClick={addItem}
            className="bg-green-700 text-white rounded-xl px-3 py-2 hover:bg-green-600 transition-colors flex-shrink-0"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Aviso de dónde salió el precio sugerido: hay que confirmarlo, no
            es necesariamente el precio de hoy en la góndola. */}
        {precioOrigen && (
          <p className="text-[11px] text-green-700 leading-snug -mt-1">
            {precioOrigen === 'comunidad'
              ? '✓ Precio reportado por otro usuario — verifica y edita si cambió.'
              : '✓ Precio del catálogo — verifica y edita si cambió.'}
          </p>
        )}

        {/* Kg accumulator chips */}
        {form.unit === 'Kg' && kgParcials.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {kgParcials.map((v, i) => (
              <span
                key={i}
                className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full"
              >
                {v.toFixed(3)} Kg
                <button
                  type="button"
                  onClick={() => removeKgParcial(i)}
                  className="text-blue-500 hover:text-red-500 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            <span className="text-xs font-bold text-blue-700 ml-1">
              = {parseFloat((kgTotal + (parseFloat(form.quantity) > 0 ? parseFloat(form.quantity) : 0)).toFixed(3))} Kg
            </span>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-2 bg-brand-lime-soft">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-16">
            <DollarSign size={48} strokeWidth={1} />
            <p className="text-base">Sin productos aún</p>
            <p className="text-sm">Agrega productos para calcular el total</p>
          </div>
        ) : (
          items.map(item => (
            // Precio en 0 se resalta: normalmente viene de la Lista sin precio
            // registrado y hay que completarlo antes de guardar la compra.
            <div
              key={item.id}
              className={`bg-white rounded-2xl shadow-sm px-4 py-3 border ${
                item.unitPrice === 0 ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100'
              }`}
            >
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={editForm.quantity}
                      onChange={e => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                      className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <UnitToggle value={editForm.unit} onChange={u => setEditForm(prev => ({ ...prev, unit: u }))} />
                    <input
                      type="number"
                      value={editForm.unitPrice}
                      onChange={e => setEditForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      placeholder="USD"
                    />
                    <button onClick={() => saveEdit(item.id)} className="text-green-600"><Check size={18} /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400"><X size={18} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {/* Solo se muestra si hay foto: sin coincidencia, un ícono
                      vacío en cada fila sería más ruido que ayuda. */}
                  {selectedStore && mejorCoincidencia(item.name, catalogo)?.candidato.urlImagen && (
                    <FotoProducto
                      url={mejorCoincidencia(item.name, catalogo)!.candidato.urlImagen}
                      alt={item.name}
                      size={40}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
                    {item.unitPrice === 0 ? (
                      <button
                        onClick={() => startEdit(item)}
                        className="text-xs text-yellow-700 font-semibold underline"
                      >
                        {item.quantity} {item.unit ?? 'Und'} · Falta el precio
                      </button>
                    ) : (
                      <p className="text-xs text-gray-500">
                        {item.quantity} {item.unit ?? 'Und'} × ${item.unitPrice.toFixed(2)}
                      </p>
                    )}
                  </div>
                  {(() => {
                    const f = cantidadFacturable(item.name, item.quantity, item.unit ?? 'Und');
                    const sub = f.cantidad * item.unitPrice;
                    return (
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-green-700 text-sm">${sub.toFixed(2)}</p>
                        {f.kgEstimados !== null && (
                          <p className="text-[10px] text-gray-400 leading-tight">
                            {formatearPeso(f.kgEstimados)}
                          </p>
                        )}
                        {rates.bcv && (
                          <p className="text-xs text-gray-400">Bs {formatBs(sub, rates.bcv)}</p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(item)} className="text-gray-400 hover:text-blue-500 p-1"><Edit2 size={14} /></button>
                    <button onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Guardar compra */}
      {items.length > 0 && (
        <div className="px-4 pb-4 pt-3 bg-white border-t border-gray-100 space-y-2">
          {!selectedStore && (
            <p className="text-xs text-yellow-600 font-medium text-center">
              Selecciona el establecimiento antes de guardar
            </p>
          )}
          {missingPriceCount > 0 && (
            <p className="text-xs text-yellow-600 font-medium text-center">
              {missingPriceCount} {missingPriceCount === 1 ? 'producto' : 'productos'} sin precio.
              No {missingPriceCount === 1 ? 'se sumará' : 'se sumarán'} al total ni a la comparativa.
            </p>
          )}
          <button
            onClick={savePurchase}
            disabled={!selectedStore}
            className="w-full bg-brand-dark hover:bg-brand-dark-hover active:bg-brand-dark-active text-white rounded-full py-3.5 font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            Guardar Compra
          </button>
        </div>
      )}
      {savedMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg z-50">
          ✓ Compra guardada correctamente
        </div>
      )}

      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
      {showBuscador && (
        <BuscadorCatalogo
          catalogo={catalogo}
          establecimiento={selectedStore}
          cargando={cargandoCatalogo}
          onElegir={usarDelCatalogo}
          onCerrar={() => setShowBuscador(false)}
        />
      )}
      {unknownBarcode && (
        <NewProductModal
          barcode={unknownBarcode}
          onConfirm={name => {
            setForm(prev => ({ ...prev, name }));
            autocompletarPrecio(name, unknownBarcode);
            setUnknownBarcode(null);
          }}
          onCancel={() => { setForm(prev => ({ ...prev, name: unknownBarcode })); setUnknownBarcode(null); }}
        />
      )}
    </div>
  );
}
