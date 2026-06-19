import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, ShoppingCart, ScanLine } from 'lucide-react';
import type { ShoppingItem, Category, Unit } from '../types';
import { categorizeProduct } from '../utils/categorize';
import { lookupBarcode } from '../utils/lookupBarcode';
import BarcodeScanner from './BarcodeScanner';
import NewProductModal from './NewProductModal';

interface Props {
  items: ShoppingItem[];
  setItems: (val: ShoppingItem[] | ((prev: ShoppingItem[]) => ShoppingItem[])) => void;
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

export default function ShoppingList({ items, setItems }: Props) {
  const [input, setInput] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<Unit>('Und');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());
  const [showScanner, setShowScanner] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);

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
    };
    setItems(prev => [...prev, newItem]);
    setInput('');
    setQuantity('1');
  };

  const handleScan = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setLoadingProduct(true);
    const name = await lookupBarcode(barcode);
    setLoadingProduct(false);
    if (name) {
      setInput(name);
    } else {
      setUnknownBarcode(barcode);
    }
  }, []);

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
    <div className="flex flex-col h-full">
      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
      {unknownBarcode && (
        <NewProductModal
          barcode={unknownBarcode}
          onConfirm={name => { setInput(name); setUnknownBarcode(null); }}
          onCancel={() => { setInput(unknownBarcode); setUnknownBarcode(null); }}
        />
      )}

      {/* Subheader */}
      <div className="bg-[#14532d] px-4 pt-3 pb-4">
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
      </div>

      {/* Add item */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={loadingProduct ? 'Buscando producto...' : input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Agregar producto..."
            disabled={loadingProduct}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
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

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#f0fdf4]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-16">
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
                      {catItems.map((item, idx) => (
                        <li
                          key={item.id}
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
                          <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {item.name}
                            {(item.quantity || item.unit) && (
                              <span className="ml-2 text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                                {item.quantity ?? 1} {item.unit ?? 'Und'}
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                      ))}
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
    </div>
  );
}
