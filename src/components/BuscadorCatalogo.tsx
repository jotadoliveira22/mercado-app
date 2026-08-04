import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { buscarEnCatalogo, type CandidatoCatalogo } from '../utils/matchProducto';

interface Props {
  /** Catálogo del establecimiento, ya cargado en memoria. */
  catalogo: CandidatoCatalogo[];
  establecimiento: string;
  cargando: boolean;
  onElegir: (producto: CandidatoCatalogo) => void;
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
  catalogo, establecimiento, cargando, onElegir, onCerrar,
}: Props) {
  const [texto, setTexto] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const sugerencias = useMemo(
    () => buscarEnCatalogo(texto, catalogo, 25),
    [texto, catalogo],
  );

  const escribioAlgo = texto.trim().length >= 2;

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
              onClick={() => onElegir(s)}
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
      </div>
    </div>
  );
}
