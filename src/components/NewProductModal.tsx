import { useState } from 'react';
import { PackagePlus, X } from 'lucide-react';
import { saveCustomProduct } from '../utils/lookupBarcode';

interface Props {
  barcode: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function NewProductModal({ barcode, onConfirm, onCancel }: Props) {
  const [name, setName] = useState('');
  const [save, setSave] = useState(true);

  const confirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (save) saveCustomProduct(barcode, trimmed);
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackagePlus size={20} className="text-white" />
            <h2 className="text-white font-bold text-base">Producto no encontrado</h2>
          </div>
          <button onClick={onCancel} className="text-white hover:text-green-200">
            <X size={22} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Código escaneado</p>
            <p className="text-sm font-mono bg-gray-100 rounded-lg px-3 py-2 text-gray-700">{barcode}</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">
              Nombre del producto
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              placeholder="Ej: Leche Completa 1L"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setSave(v => !v)}
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 flex items-center px-1 ${save ? 'bg-green-600' : 'bg-gray-300'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${save ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-gray-600">Guardar para futuras lecturas</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              disabled={!name.trim()}
              className="flex-1 bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-600 disabled:opacity-40 transition-colors"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
