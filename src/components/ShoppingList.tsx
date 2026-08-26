import { useState, useMemo, useCallback, useRef, Fragment } from 'react';
import { Plus, Minus, Trash2, ChevronDown, ChevronRight, ShoppingCart, ScanLine, ShoppingBag, Loader, Search } from 'lucide-react';
import type { ShoppingItem, Category, Unit } from '../types';
import { categorizeProduct } from '../utils/categorize';
import { lookupBarcode } from '../utils/lookupBarcode';
import { priceKeyCandidates } from '../utils/priceKey';
import { fetchStorePrices, fetchCatalogoDeTienda } from '../hooks/useSync';
import { mejorCoincidencia, type CandidatoCatalogo } from '../utils/matchProducto';
import { cantidadFacturable, formatearPeso } from '../utils/pesosUnitarios';
import BarcodeScanner from './BarcodeScanner';
import NewProductModal from './NewProductModal';
import StoreSelect from './StoreSelect';
import BuscadorCatalogo from './BuscadorCatalogo';
import FotoProducto from './FotoProducto';

/** Paso de ajuste: 0,1 en Kg para pesos como 0,5; 1 en unidades. */
function paso(unidad?: Unit): number {
  return unidad === 'Kg' ? 0.1 : 1;
}

/** Evita los decimales largos de la suma en coma flotante (0,30000000000000004). */
function redondear(n: number): number {
  return parseFloat(n.toFixed(3));
}

/** Precio resuelto para un producto de la lista, con su procedencia. */
interface PrecioResuelto {
  precio: number;
  origen: 'catalogo' | 'comunidad';
  /** Nombre del producto del catálogo con el que se emparejó. */
  nombre?: string;
  /** Solo cuando el origen es 'catalogo': la foto del producto emparejado. */
  urlImagen?: string | null;
}

interface Props {
  items: ShoppingItem[];
  setItems: (val: ShoppingItem[] | ((prev: ShoppingItem[]) => ShoppingItem[])) => void;
  /** Pasa la lista al carrito con el precio ya resuelto de cada producto. */
  onMigrateToCart: (items: ShoppingItem[], preciosPorItem: Map<string, number>) => void;
}

const ALL_CATEGORIES: Category[] = [
  'Lácteos', 'Huevos', 'Carnes y Aves', 'Charcutería y Embutidos',
  'Pescados y Mariscos', 'Frutas y Verduras', 'Panadería y Repostería',
  'Cereales, Pastas y Harinas', 'Aceites y Untables', 'Salsas y Condimentos',
  'Enlatados y Conservas', 'Snacks y Frutos Secos', 'Dulces y Galletas',
  'Bebidas', 'Café e Infusiones', 'Congelados', 'Comidas Preparadas',
  'Sopas y Caldos', 'Limpieza', 'Higiene Personal', 'Mascotas', 'Otros',
];

const CATEGORY_ICONS: Record<Category, string> = {
  'Lácteos': '🥛',
  'Huevos': '🥚',
  'Carnes y Aves': '🥩',
  'Charcutería y Embutidos': '🍖',
  'Pescados y Mariscos': '🐟',
  'Frutas y Verduras': '🥦',
  'Panadería y Repostería': '🍞',
  'Cereales, Pastas y Harinas': '🍝',
  'Aceites y Untables': '🫙',
  'Salsas y Condimentos': '🧂',
  'Enlatados y Conservas': '🥫',
  'Snacks y Frutos Secos': '🥜',
  'Dulces y Galletas': '🍫',
  'Bebidas': '🥤',
  'Café e Infusiones': '☕',
  'Congelados': '🧊',
  'Comidas Preparadas': '🍱',
  'Sopas y Caldos': '🍲',
  'Limpieza': '🧹',
  'Higiene Personal': '🧴',
  'Mascotas': '🐾',
  'Otros': '🛒',
};

export default function ShoppingList({ items, setItems, onMigrateToCart }: Props) {
  const [input, setInput] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<Unit>('Und');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());
  const [showScanner, setShowScanner] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  // Código del último escaneo, para guardarlo junto al producto.
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(undefined);
  const [showBuscador, setShowBuscador] = useState(false);
  // Producto cuya cantidad se está editando dentro de la lista.
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [store, setStore] = useState('');
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [catalogo, setCatalogo] = useState<CandidatoCatalogo[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  // Descarta respuestas de un establecimiento que ya no está seleccionado.
  const priceRequest = useRef(0);

  const changeStore = useCallback(async (next: string) => {
    const request = ++priceRequest.current;
    setStore(next);
    setPrices(new Map());
    setCatalogo([]);
    if (!next) return;
    setLoadingPrices(true);
    const [aportes, cat] = await Promise.all([
      fetchStorePrices(next),
      fetchCatalogoDeTienda(next),
    ]);
    if (priceRequest.current !== request) return; // llegó tarde, ya hay otro
    setPrices(aportes ?? new Map());
    setCatalogo(cat);
    setLoadingPrices(false);
  }, []);

  /**
   * Precio unitario del producto en el establecimiento, o null si no se conoce.
   *
   * Primero los aportes de la comunidad, que se cruzan por código de barras y
   * por tanto son exactos. Si no hay, se busca en el catálogo por nombre: el
   * catálogo no tiene códigos de barras, así que el nombre es el único puente.
   */
  const priceOf = useCallback((item: ShoppingItem): PrecioResuelto | null => {
    for (const key of priceKeyCandidates(item)) {
      const found = prices.get(key);
      if (found !== undefined) return { precio: found, origen: 'comunidad' };
    }
    const m = mejorCoincidencia(item.name, catalogo);
    if (m) return { precio: m.candidato.precio, origen: 'catalogo', nombre: m.candidato.nombre, urlImagen: m.candidato.urlImagen };
    return null;
  }, [prices, catalogo]);

  // Total estimado: solo suma lo que sí tiene precio, y cuenta lo que falta
  // para no presentar un total parcial como si fuera completo.
  const estimate = useMemo(() => {
    let total = 0;
    let withPrice = 0;
    for (const item of items) {
      const p = priceOf(item);
      if (p === null) continue;
      // Un producto por kilo se cobra por kilo aunque se cuente en piezas.
      const { cantidad } = cantidadFacturable(item.name, item.quantity ?? 1, item.unit ?? 'Und');
      total += p.precio * cantidad;
      withPrice++;
    }
    return { total, withPrice, missing: items.length - withPrice };
  }, [items, priceOf]);

  const groupedItems = useMemo(() => {
    const groups: Partial<Record<Category, ShoppingItem[]>> = {};
    for (const item of items) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category]!.push(item);
    }
    return groups;
  }, [items]);

  const checkedCount = items.filter(i => i.checked).length;
  const totalCount = items.length;

  const addItem = () => {
    const name = input.trim();
    if (!name) return;
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name,
      category: categorizeProduct(name),
      checked: false,
      createdAt: Date.now(),
      quantity: parseFloat(quantity) || 1,
      unit,
      barcode: scannedBarcode,
    };
    setItems(prev => [...prev, newItem]);
    setInput('');
    setQuantity('1');
    setScannedBarcode(undefined);
  };

  const handleScan = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setLoadingProduct(true);
    const name = await lookupBarcode(barcode);
    setLoadingProduct(false);
    // Se conserva el código: es lo que permite cruzar el precio de forma exacta.
    setScannedBarcode(barcode);
    if (name) {
      setInput(name);
    } else {
      setUnknownBarcode(barcode);
    }
  }, []);

  /**
   * Producto elegido del buscador: se agrega directo con la cantidad y unidad
   * que ya están en el formulario. El nombre queda idéntico al del catálogo,
   * así que el precio se resuelve de forma exacta y no por aproximación.
   */
  const agregarDelCatalogo = (producto: CandidatoCatalogo, cantidad: number, unidad: Unit) => {
    setShowBuscador(false);
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      name: producto.nombre,
      category: categorizeProduct(producto.nombre),
      checked: false,
      createdAt: Date.now(),
      quantity: cantidad,
      unit: unidad,
    }]);
  };

  /** Cambia la cantidad de un producto ya agregado. */
  const cambiarCantidad = (id: string, cantidad: number, unidad: Unit) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, quantity: cantidad, unit: unidad } : i));
  };

  const migrateToCart = () => {
    if (items.length === 0) return;
    // Se resuelve aquí y se pasa por id de producto: el precio puede venir del
    // catálogo, y ese cruce se hace por nombre, no por la clave de los aportes.
    const resueltos = new Map<string, number>();
    for (const item of items) {
      const p = priceOf(item);
      if (p) resueltos.set(item.id, p.precio);
    }
    onMigrateToCart(items, resueltos);
  };

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleCategory = (cat: Category) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearChecked = () => {
    setItems(prev => prev.filter(i => !i.checked));
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto overscroll-contain">
      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
      {showBuscador && (
        <BuscadorCatalogo
          catalogo={catalogo}
          establecimiento={store}
          cargando={loadingPrices}
          pedirCantidad
          onElegir={agregarDelCatalogo}
          onCerrar={() => setShowBuscador(false)}
        />
      )}
      {unknownBarcode && (
        <NewProductModal
          barcode={unknownBarcode}
          onConfirm={name => { setInput(name); setUnknownBarcode(null); }}
          onCancel={() => { setInput(unknownBarcode); setUnknownBarcode(null); }}
        />
      )}

      {/* Subheader */}
      <div className="bg-brand-dark-hover px-4 pt-3 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Lista de Compras</h2>
            {totalCount > 0 && (
              <p className="text-green-300 text-xs mt-0.5">{checkedCount} de {totalCount} productos</p>
            )}
            {totalCount === 0 && (
              <p className="text-green-300 text-xs mt-0.5">Agrega productos a tu lista</p>
            )}
          </div>
          {totalCount > 0 && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-white font-extrabold text-lg">{Math.round((checkedCount / totalCount) * 100)}%</span>
              <div className="w-24 bg-green-900 rounded-full h-2">
                <div
                  className="bg-green-300 rounded-full h-2 transition-all duration-500"
                  style={{ width: `${(checkedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Establecimiento: al elegirlo aparecen los precios de la base de datos */}
        <StoreSelect value={store} onChange={changeStore} />

        {store && items.length > 0 && (
          <div className="bg-green-800 bg-opacity-40 rounded-xl px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-green-200 text-xs font-medium">Total estimado</span>
              {loadingPrices ? (
                <Loader size={14} className="animate-spin text-green-300" />
              ) : (
                <span className="text-white font-extrabold text-xl">
                  ${estimate.total.toFixed(2)}
                </span>
              )}
            </div>
            {!loadingPrices && estimate.missing > 0 && (
              <p className="text-yellow-300 text-[11px] mt-1 leading-snug">
                {estimate.missing} de {items.length} {estimate.missing === 1 ? 'producto' : 'productos'} sin
                precio registrado en este establecimiento. El total es parcial.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add item */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={loadingProduct ? 'Buscando producto...' : input}
            onChange={e => {
              setInput(e.target.value);
              // Editar el nombre a mano desliga el código escaneado: pegarlo a
              // otro producto ensuciaría los precios compartidos.
              setScannedBarcode(undefined);
            }}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Agregar producto..."
            disabled={loadingProduct}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowBuscador(true)}
            disabled={!store}
            title={store ? 'Buscar en el catálogo' : 'Selecciona un establecimiento para buscar'}
            className="bg-green-100 hover:bg-green-200 text-green-700 rounded-xl px-3 py-2 flex items-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Search size={20} />
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="bg-green-100 hover:bg-green-200 text-green-700 rounded-xl px-3 py-2 flex items-center transition-colors"
            title="Escanear código de barras"
          >
            <ScanLine size={20} />
          </button>
          <button
            onClick={addItem}
            className="bg-green-700 text-white rounded-xl px-4 py-2 hover:bg-green-600 active:bg-green-800 transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-20 border border-gray-300 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
          />
          <div className="flex rounded-xl overflow-hidden border border-gray-300">
            <button
              onClick={() => setUnit('Und')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${unit === 'Und' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Und
            </button>
            <button
              onClick={() => setUnit('Kg')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${unit === 'Kg' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Kg
            </button>
          </div>
        </div>
      </div>

      {/* List: se desplaza junto con el encabezado y los totales de arriba,
          no en un recuadro aparte — así bajar deja ver más productos y
          subir vuelve a mostrar el resumen, como lo pidió el usuario. */}
      <div className="px-4 py-3 space-y-3 bg-brand-lime-soft">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
            <ShoppingCart size={48} strokeWidth={1} />
            <p className="text-base">Tu lista está vacía</p>
            <p className="text-sm">Agrega productos manualmente o escanea un código</p>
          </div>
        ) : (
          <>
            {ALL_CATEGORIES.map(cat => {
              const catItems = groupedItems[cat];
              if (!catItems || catItems.length === 0) return null;
              const isCollapsed = collapsedCategories.has(cat);
              const checkedInCat = catItems.filter(i => i.checked).length;
              return (
                <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                      <span className="font-semibold text-gray-700 text-sm">{cat}</span>
                      <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        {checkedInCat}/{catItems.length}
                      </span>
                    </div>
                    {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {!isCollapsed && (
                    <ul>
                      {catItems.map((item, idx) => {
                        const resuelto = priceOf(item);
                        const facturable = cantidadFacturable(item.name, item.quantity ?? 1, item.unit ?? 'Und');
                        return (
                        // La key va en el fragmento, no en el <li>: la fila
                        // puede renderizar dos elementos cuando se edita.
                        <Fragment key={item.id}>
                        <li
                          className={`flex items-center gap-3 px-4 py-3 ${idx < catItems.length - 1 ? 'border-b border-gray-50' : ''}`}
                        >
                          <button
                            onClick={() => toggleItem(item.id)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
                            }`}
                          >
                            {item.checked && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          {/* Solo se muestra si hay foto: en una lista de
                              chequeo, un ícono vacío en cada fila sin
                              coincidencia sería más ruido que ayuda. */}
                          {store && resuelto?.urlImagen && (
                            <FotoProducto url={resuelto.urlImagen} alt={item.name} size={32} />
                          )}
                          <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {item.name}
                            {/* Tocar la cantidad la vuelve editable. */}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setEditandoId(editandoId === item.id ? null : item.id);
                              }}
                              className="ml-2 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-1.5 py-0.5 rounded-full transition-colors"
                              title="Cambiar cantidad"
                            >
                              {item.quantity ?? 1} {item.unit ?? 'Und'}
                            </button>
                          </span>
                          {/* Precio del establecimiento. Si no está en la base
                              de datos se deja en blanco, nunca estimado. */}
                          {store && (
                            <span className="text-right flex-shrink-0 min-w-[52px]">
                              {resuelto === null ? (
                                <span className="text-gray-300 text-xs">—</span>
                              ) : (
                                <span className="flex items-center justify-end gap-1">
                                  {/* Punto de origen: azul si el precio viene del
                                      catálogo del supermercado, ámbar si lo
                                      aportó otro usuario. */}
                                  <span
                                    title={
                                      resuelto.origen === 'catalogo'
                                        ? `Catálogo: ${resuelto.nombre ?? ''}`
                                        : 'Precio aportado por la comunidad'
                                    }
                                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                      resuelto.origen === 'catalogo' ? 'bg-blue-400' : 'bg-amber-400'
                                    }`}
                                  />
                                  <span className="text-right">
                                    <span className={`block text-sm font-bold ${item.checked ? 'text-gray-400' : 'text-green-700'}`}>
                                      ${(resuelto.precio * facturable.cantidad).toFixed(2)}
                                    </span>
                                    {facturable.kgEstimados !== null && (
                                      <span className="block text-[10px] text-gray-400 leading-tight">
                                        {formatearPeso(facturable.kgEstimados)}
                                      </span>
                                    )}
                                  </span>
                                </span>
                              )}
                            </span>
                          )}
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                        {editandoId === item.id && (
                          <li className="px-4 py-2.5 bg-green-50 border-b border-gray-50 flex items-center gap-2">
                            <button
                              onClick={() => cambiarCantidad(
                                item.id,
                                Math.max(paso(item.unit), redondear((item.quantity ?? 1) - paso(item.unit))),
                                item.unit ?? 'Und',
                              )}
                              className="w-8 h-8 rounded-lg bg-white border border-gray-300 text-gray-700 flex items-center justify-center active:bg-gray-100"
                              aria-label="Quitar"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0.1"
                              step={item.unit === 'Kg' ? '0.1' : '1'}
                              value={item.quantity ?? 1}
                              onChange={e => {
                                const n = parseFloat(e.target.value);
                                if (Number.isFinite(n) && n > 0) {
                                  cambiarCantidad(item.id, n, item.unit ?? 'Und');
                                }
                              }}
                              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <button
                              onClick={() => cambiarCantidad(
                                item.id,
                                redondear((item.quantity ?? 1) + paso(item.unit)),
                                item.unit ?? 'Und',
                              )}
                              className="w-8 h-8 rounded-lg bg-white border border-gray-300 text-gray-700 flex items-center justify-center active:bg-gray-100"
                              aria-label="Agregar"
                            >
                              <Plus size={14} />
                            </button>
                            <div className="flex rounded-lg overflow-hidden border border-gray-300 ml-1">
                              {(['Und', 'Kg'] as const).map(u => (
                                <button
                                  key={u}
                                  onClick={() => cambiarCantidad(item.id, item.quantity ?? 1, u)}
                                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                    (item.unit ?? 'Und') === u ? 'bg-green-700 text-white' : 'bg-white text-gray-600'
                                  }`}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => setEditandoId(null)}
                              className="ml-auto text-xs font-semibold text-green-700 px-2 py-1"
                            >
                              Listo
                            </button>
                          </li>
                        )}
                        </Fragment>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
            {checkedCount > 0 && (
              <button
                onClick={clearChecked}
                className="w-full py-2 text-sm text-red-400 hover:text-red-600 font-medium"
              >
                Eliminar {checkedCount} item{checkedCount > 1 ? 's' : ''} comprado{checkedCount > 1 ? 's' : ''}
              </button>
            )}
          </>
        )}
      </div>

      {/* Continuar a carrito */}
      {items.length > 0 && (
        <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-gray-100">
          <button
            onClick={migrateToCart}
            className="w-full bg-brand-dark hover:bg-brand-dark-hover active:bg-brand-dark-active text-white font-bold rounded-full py-3 flex items-center justify-center gap-2 transition-colors shadow-md"
          >
            <ShoppingBag size={18} />
            Continuar a carrito
          </button>
          <p className="text-center text-[11px] text-gray-400 mt-1.5">
            Pasa {items.length} {items.length === 1 ? 'producto' : 'productos'} al carrito y vacía la lista
          </p>
        </div>
      )}
    </div>
  );
}
