import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Plus, Minus } from 'lucide-react';
import { buscarEnCatalogo, type CandidatoCatalogo } from '../utils/matchProducto';
import type { Unit } from '../types';
import { admiteConversion, cantidadFacturable, formatearPeso, pesoUnitario, guardarAjustePeso } from '../utils/pesosUnitarios';

interface Props {
  /** Catálogo del establecimiento, ya cargado en memoria. */
  catalogo: CandidatoCatalogo[];
  establecimiento: string;
  cargando: boolean;
  /**
   * Si es true, al tocar una sugerencia se pide cantidad y unidad antes de
   * agregar. La Lista lo necesita porque agrega el producto de inmediato; el
   * Carrito no, porque solo rellena el formulario y la cantidad se pone allí.
   */
  pedirCantidad?: boolean;
  onElegir: (producto: CandidatoCatalogo, cantidad: number, unidad: Unit) => void;
  onCerrar: () => void;
}

/**
 * Buscador de productos del catálogo, para agregar sin escanear.
 *
 * Filtra en memoria, no contra el servidor: el catálogo del establecimiento ya
 * está cargado, así que las sugerencias salen al instante aunque la señal esté
 * mala —que es la condición normal dentro de un supermercado—.
 *
 * Elegir de la lista además vuelve exacto el precio: cuando el usuario escribe
 * el nombre a mano, la app tiene que adivinar contra qué producto del catálogo
 * cruzarlo; al elegirlo aquí no hay nada que adivinar.
 */
export default function BuscadorCatalogo({
  catalogo, establecimiento, cargando, pedirCantidad = false, onElegir, onCerrar,
}: Props) {
  const [texto, setTexto] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Producto tocado, a la espera de que se confirme la cantidad.
  const [elegido, setElegido] = useState<CandidatoCatalogo | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [unidad, setUnidad] = useState<Unit>('Und');

  useEffect(() => { inputRef.current?.focus(); }, []);

  const sugerencias = useMemo(
    () => buscarEnCatalogo(texto, catalogo, 25),
    [texto, catalogo],
  );

  const escribioAlgo = texto.trim().length >= 2;

  const tocarSugerencia = (producto: CandidatoCatalogo) => {
    if (!pedirCantidad) { onElegir(producto, 1, 'Und'); return; }
    setElegido(producto);
    setCantidad('1');
    setUnidad('Und');
  };

  const confirmar = () => {
    if (!elegido) return;
    const n = parseFloat(cantidad);
    onElegir(elegido, Number.isFinite(n) && n > 0 ? n : 1, unidad);
  };

  const ajustar = (delta: number) => {
    const actual = parseFloat(cantidad);
    const base = Number.isFinite(actual) ? actual : 1;
    // Paso de 0,1 en Kg para pesos como 0,5; de 1 en unidades.
    const paso = unidad === 'Kg' ? 0.1 : 1;
    const siguiente = Math.max(paso, parseFloat((base + delta * paso).toFixed(3)));
    setCantidad(String(siguiente));
  };

  const cantidadNum = parseFloat(cantidad);
  const valida = Number.isFinite(cantidadNum) && cantidadNum > 0;

  // Un producto por kilo se cobra por kilo aunque se cuente en piezas: 4
  // tomates a $2,45/Kg no cuestan $9,80 sino unos $0,88.
  const facturable = elegido && valida
    ? cantidadFacturable(elegido.nombre, cantidadNum, unidad)
    : null;
  const totalPrevisto = elegido && facturable ? elegido.precio * facturable.cantidad : null;

  const convierte = elegido ? admiteConversion(elegido.nombre) : false;
  const referencia = elegido && convierte ? pesoUnitario(elegido.nombre) : null;

  /** Guarda el peso real de una pieza que midió el usuario. */
  const corregirPeso = () => {
    if (!elegido || !referencia) return;
    const txt = window.prompt(
      `¿Cuánto pesa una unidad de "${elegido.nombre}"?\n\nEn gramos. Ahora se estima en ${referencia.gramos} g.`,
      String(referencia.gramos),
    );
    if (txt === null) return;
    const g = parseFloat(txt.replace(',', '.'));
    if (!(g > 0)) return;
    guardarAjustePeso(elegido.nombre, g);
    // Se fuerza un repintado reasignando el producto elegido.
    setElegido({ ...elegido });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex flex-col items-center justify-start p-3 pt-8">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Encabezado */}
        <div className="bg-green-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-white font-bold text-base">Buscar producto</h2>
            <p className="text-green-200 text-xs truncate">{establecimiento}</p>
          </div>
          <button onClick={onCerrar} className="text-white hover:text-green-200 flex-shrink-0 ml-2">
            <X size={22} />
          </button>
        </div>

        {/* Campo de búsqueda */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Escribe el nombre del producto..."
              className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Sugerencias */}
        <div className="flex-1 overflow-y-auto">
          {cargando && (
            <p className="text-center text-sm text-gray-400 py-8">Cargando catálogo...</p>
          )}

          {!cargando && !escribioAlgo && (
            <p className="text-center text-sm text-gray-400 py-8 px-6 leading-relaxed">
              Escribe al menos dos letras.<br />
              <span className="text-xs">{catalogo.length} productos disponibles</span>
            </p>
          )}

          {!cargando && escribioAlgo && sugerencias.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8 px-6 leading-relaxed">
              Sin resultados para «{texto.trim()}».<br />
              <span className="text-xs">
                Puedes agregarlo a mano; su precio quedará en blanco.
              </span>
            </p>
          )}

          {!cargando && sugerencias.map((s, i) => (
            <button
              key={`${s.nombreNorm}-${i}`}
              onClick={() => tocarSugerencia(s)}
              className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-green-50 active:bg-green-100 transition-colors flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{s.nombre}</p>
                {s.presentacion && (
                  <p className="text-xs text-gray-400 mt-0.5">{s.presentacion}</p>
                )}
              </div>
              <span className="text-sm font-bold text-green-700 flex-shrink-0">
                ${s.precio.toFixed(2)}
              </span>
            </button>
          ))}
        </div>

        {/* Confirmación de cantidad, sobre el producto tocado */}
        {elegido && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 leading-snug">{elegido.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  ${elegido.precio.toFixed(2)}
                  {elegido.presentacion ? ` · ${elegido.presentacion}` : ''}
                </p>
              </div>
              <button
                onClick={() => setElegido(null)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                title="Elegir otro producto"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => ajustar(-1)}
                className="w-9 h-9 rounded-xl bg-white border border-gray-300 text-gray-700 font-bold flex items-center justify-center active:bg-gray-100"
                aria-label="Quitar uno"
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                inputMode="decimal"
                min="0.1"
                step={unidad === 'Kg' ? '0.1' : '1'}
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-16 border border-gray-300 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={() => ajustar(1)}
                className="w-9 h-9 rounded-xl bg-white border border-gray-300 text-gray-700 font-bold flex items-center justify-center active:bg-gray-100"
                aria-label="Agregar uno"
              >
                <Plus size={16} />
              </button>

              <div className="flex rounded-xl overflow-hidden border border-gray-300 ml-1">
                {(['Und', 'Kg'] as const).map(u => (
                  <button
                    key={u}
                    onClick={() => setUnidad(u)}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      unidad === u ? 'bg-green-700 text-white' : 'bg-white text-gray-600'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>

              {totalPrevisto !== null && (
                <span className="ml-auto text-sm font-bold text-green-700">
                  ${totalPrevisto.toFixed(2)}
                </span>
              )}
            </div>

            {/* Conversión de piezas a peso, para lo que se vende por Kg */}
            {convierte && facturable?.kgEstimados != null && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <span className="text-xs text-amber-900 leading-snug flex-1">
                  {formatearPeso(facturable.kgEstimados)} en total
                  <span className="text-amber-700">
                    {' · '}unos {referencia?.gramos} g por unidad
                    {referencia?.ajustado ? ' (tu medida)' : ' (aproximado)'}
                  </span>
                </span>
                <button
                  onClick={corregirPeso}
                  className="text-xs font-semibold text-amber-800 underline flex-shrink-0"
                >
                  Corregir
                </button>
              </div>
            )}

            {convierte && unidad === 'Kg' && (
              <p className="text-[11px] text-gray-500 leading-snug">
                Cambia a <strong>Und</strong> si prefieres contar piezas y que la app estime el peso.
              </p>
            )}

            <button
              onClick={confirmar}
              className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
            >
              Agregar a la lista
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
