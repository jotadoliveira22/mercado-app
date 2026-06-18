import { useState, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Camera, DollarSign, AlertCircle } from 'lucide-react';
import type { TrackerItem, ExchangeRates } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useExchangeRates } from '../hooks/useExchangeRates';
import BarcodeScanner from './BarcodeScanner';

export default function CostTracker() {
  const [items, setItems] = useLocalStorage<TrackerItem[]>('tracker-items', []);
  const { rates, setRates, loading, error, fetchRates } = useExchangeRates();
  const [showScanner, setShowScanner] = useState(false);
  const [manualBcv, setManualBcv] = useState('');
  const [manualBinance, setManualBinance] = useState('');
  const [showManualRates, setShowManualRates] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: '', quantity: '1', unitPrice: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '1', unitPrice: '' });
  const [loadingProduct, setLoadingProduct] = useState(false);

  const totalUSD = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const handleScan = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setLoadingProduct(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await res.json();
      const productName = data?.product?.product_name || data?.product?.product_name_es || '';
      setForm(prev => ({ ...prev, name: productName }));
    } catch {
      setForm(prev => ({ ...prev, name: '' }));
    } finally {
      setLoadingProduct(false);
    }
  }, []);

  const addItem = () => {
    const name = form.name.trim();
    const quantity = parseFloat(form.quantity);
    const unitPrice = parseFloat(form.unitPrice);
    if (!name || isNaN(quantity) || isNaN(unitPrice) || quantity <= 0 || unitPrice < 0) return;

    const newItem: TrackerItem = {
      id: crypto.randomUUID(),
      name,
      quantity,
      unitPrice,
    };
    setItems(prev => [...prev, newItem]);
    setForm({ name: '', quantity: '1', unitPrice: '' });
  };

  const deleteItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const startEdit = (item: TrackerItem) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, quantity: String(item.quantity), unitPrice: String(item.unitPrice) });
  };

  const saveEdit = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      name: editForm.name.trim() || i.name,
      quantity: parseFloat(editForm.quantity) || i.quantity,
      unitPrice: parseFloat(editForm.unitPrice) ?? i.unitPrice,
    } : i));
    setEditingId(null);
  };

  const applyManualRates = () => {
    const bcv = parseFloat(manualBcv);
    const binance = parseFloat(manualBinance);
    setRates((prev: ExchangeRates) => ({
      ...prev,
      bcv: isNaN(bcv) ? prev.bcv : bcv,
      binance: isNaN(binance) ? prev.binance : binance,
      lastUpdated: Date.now(),
    }));
    setShowManualRates(false);
  };

  const formatBs = (usd: number, rate: number | null) => {
    if (!rate) return '—';
    return (usd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-green-700 px-4 py-4 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="text-white" size={22} />
          <h1 className="text-white font-bold text-xl">Calculadora de Mercado</h1>
        </div>
        {/* Total cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-600 rounded-xl px-3 py-2 text-center">
            <p className="text-green-200 text-xs font-medium">Total USD</p>
            <p className="text-white font-bold text-sm">${totalUSD.toFixed(2)}</p>
          </div>
          <div className="bg-green-600 rounded-xl px-3 py-2 text-center">
            <p className="text-green-200 text-xs font-medium">BCV</p>
            <p className="text-white font-bold text-sm">Bs {formatBs(totalUSD, rates.bcv)}</p>
          </div>
          <div className="bg-green-600 rounded-xl px-3 py-2 text-center">
            <p className="text-green-200 text-xs font-medium">Binance</p>
            <p className="text-white font-bold text-sm">Bs {formatBs(totalUSD, rates.binance)}</p>
          </div>
        </div>
      </div>

      {/* Exchange rate bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span>BCV: <span className="font-semibold text-gray-800">{rates.bcv ? `Bs ${rates.bcv.toFixed(2)}` : '—'}</span></span>
            <span>Binance: <span className="font-semibold text-gray-800">{rates.binance ? `Bs ${rates.binance.toFixed(2)}` : '—'}</span></span>
            {rates.lastUpdated && (
              <span className="text-gray-400">
                {new Date(rates.lastUpdated).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManualRates(v => !v)}
              className="text-xs text-green-700 underline"
            >
              Manual
            </button>
            <button
              onClick={fetchRates}
              disabled={loading}
              className="text-green-700 hover:text-green-600 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
        )}
        {showManualRates && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              placeholder="BCV"
              value={manualBcv}
              onChange={e => setManualBcv(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
            />
            <input
              type="number"
              placeholder="Binance"
              value={manualBinance}
              onChange={e => setManualBinance(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
            />
            <button
              onClick={applyManualRates}
              className="bg-green-700 text-white rounded-lg px-3 py-1 text-xs"
            >
              OK
            </button>
          </div>
        )}
      </div>

      {/* Add product form */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={loadingProduct ? 'Buscando producto...' : form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Nombre del producto"
            disabled={loadingProduct}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={() => setShowScanner(true)}
            className="bg-green-700 text-white rounded-xl px-3 py-2 hover:bg-green-600 transition-colors flex-shrink-0"
            title="Escanear código de barras"
          >
            <Camera size={18} />
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={form.quantity}
            onChange={e => setForm(prev => ({ ...prev, quantity: e.target.value }))}
            placeholder="Cant."
            min="0.1"
            step="0.1"
            className="w-20 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="number"
            value={form.unitPrice}
            onChange={e => setForm(prev => ({ ...prev, unitPrice: e.target.value }))}
            placeholder="Precio USD"
            min="0"
            step="0.01"
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={addItem}
            className="bg-green-700 text-white rounded-xl px-3 py-2 hover:bg-green-600 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-16">
            <DollarSign size={48} strokeWidth={1} />
            <p className="text-base">Sin productos aún</p>
            <p className="text-sm">Agrega productos para calcular el total</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={editForm.quantity}
                      onChange={e => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                      className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      value={editForm.unitPrice}
                      onChange={e => setEditForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <button onClick={() => saveEdit(item.id)} className="text-green-600 hover:text-green-700">
                      <Check size={18} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} × ${item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-green-700 text-sm">${(item.quantity * item.unitPrice).toFixed(2)}</p>
                    {rates.bcv && (
                      <p className="text-xs text-gray-400">Bs {formatBs(item.quantity * item.unitPrice, rates.bcv)}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(item)} className="text-gray-400 hover:text-blue-500 p-1">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
