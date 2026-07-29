import { ChevronDown } from 'lucide-react';
import { STORES, STORE_PLACEHOLDER } from '../constants/stores';

interface Props {
  value: string;
  onChange: (store: string) => void;
  /** 'dark' va sobre el encabezado verde; 'light' sobre fondo blanco. */
  variant?: 'dark' | 'light';
}

/**
 * Selector de establecimiento compartido por Lista, Carrito y Comparativa,
 * para que el texto y las opciones no se desincronicen entre secciones.
 */
export default function StoreSelect({ value, onChange, variant = 'dark' }: Props) {
  const dark = variant === 'dark';
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={STORE_PLACEHOLDER}
        className={
          dark
            ? `w-full bg-green-800 bg-opacity-60 border rounded-xl px-4 py-2.5 text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-green-400 ${
                value ? 'border-green-600 text-white' : 'border-yellow-400 text-green-300'
              }`
            : `w-full bg-white border rounded-xl px-4 py-2.5 text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-green-500 ${
                value ? 'border-gray-300 text-gray-800' : 'border-yellow-400 text-gray-500'
              }`
        }
      >
        <option value="" disabled className="text-gray-400 bg-white">{STORE_PLACEHOLDER}</option>
        {STORES.map(s => (
          <option key={s} value={s} className="text-gray-800 bg-white">{s}</option>
        ))}
      </select>
      <ChevronDown
        size={15}
        className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
          dark ? 'text-green-300' : 'text-gray-400'
        }`}
      />
    </div>
  );
}
