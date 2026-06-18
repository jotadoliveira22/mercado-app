import { useState, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Camera, DollarSign, AlertCircle } from 'lucide-react';
import type { TrackerItem, ExchangeRates, Unit } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useExchangeRates } from '../hooks/useExchangeRates';
import BarcodeScanner from './BarcodeScanner';

export default function CostTracker() {
  const [items, setItems] = useLocalStorage<TrackerItem[]>('tracker-items', []);
  const { rates, setRates, loading, error, fetchRates } = useExchangeRates();
  const [showScanner, setShowScanner] = useState(false);
  const [manualBcv, setManualBcv] = useState('');
  const [manualBinance, setManualBinance] = useState(
    () => String(rates.binance ?? '')
  );

  const [form, setForm] = useState({ name: '', quantity: '1', unitPrice: '', unit: 'Und' as Unit });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '1', unitPrice: '', unit: 'Und' as Unit });
  const [loadingProduct, setLoadingProduct] = useState(false);

  const totalUSD = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const handleScan = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setLoadingProduct(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await res.json();
      const productName = data?.product?.product_name_es || data?.product?.product_name || '';
      setForm(prev => ({ ...prev, name: productName || barcode }));
    } catch {
      setForm(prev => ({ ...prev, name: barcode }));
    } finally {
      setLoadingProduct(false);
    }
  }, []);

  const addItem = () => {
    const name = form.name.trim();
    const quantity = parseFloat(form.quantity);
    const unitPrice = parseFloat(form.unitPrice);
    if (!name || isNaN(quantity) || isNaN(unitPrice) || quantity <= 0 || unitPrice < 0) return;
    const newItem: TrackerItem = { id: crypto.randomUUID(), name, quantity, unitPrice, unit: form.unit };
    setItems(prev => [...prev, newItem]);
    setForm({ name: '', quantity: '1', unitPrice: '', unit: 'Und' });
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

  const applyBinance = () => {
    const b = parseFloat(manualBinance);
    if (!isNaN(b) && b > 0) {
      setRates((prev: ExchangeRates) => ({ ...prev, binance: b, lastUpdated: Date.now() }));
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
      {/* Header */}
      <div className="bg-green-700 px-4 py-4 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="text-white" size={22} />
          <h1 className="text-white font-bold text-xl">Calculadora de Mercado</h1>
        </div>
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

      {/* Rate bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 space-y-2">
        {/* BCV row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16 flex-shrink-0">BCV:</span>
          {rates.bcv ? (
            <span className="text-xs font-semibold text-gray-800 flex-1">Bs {rates.bcv.toFixed(2)}</span>
          ) : (
            <div className="flex flex-1 gap-1">
              <input
                type="number"
                placeholder="Ingrese tasa BCV"
                value={manualBcv}
                onChange={e => setManualBcv(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyBcv()}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
              <button onClick={applyBcv} className="bg-green-700 text-white rounded-lg px-2 py-1 text-xs">OK</button>
            </div>
          )}
          <button
            onClick={fetchRates}
            disabled={loading}
            className="text-green-700 hover:text-green-600 disabled:opacity-50 flex-shrink-0"
            title="Actualizar BCV"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Binance row — always manual */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16 flex-shrink-0">Binance:</span>
          <div className="flex flex-1 gap-1">
            <input
              type="number"
              placeholder="Tasa Binance manual"
              value={manualBinance}
              onChange={e => setManualBinance(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyBinance()}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
            />
            <button onClick={applyBinance} className="bg-green-700 text-white rounded-lg px-2 py-1 text-xs">OK</button>
          </div>
          {rates.binance && (
            <span className="text-xs font-semibold text-gray-800 flex-shrink-0">Bs {rates.binance.toFixed(2)}</span>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Add product form */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 space-y-2">
        <div className="flex gap-2">
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
            className="w-20 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
          />
          <div className="flex rounded-xl overflow-hidden border border-gray-300">
            <button
              onClick={() => setForm(prev => ({ ...prev, unit: 'Und' }))}
              className={`px-3 py-2 text-sm font-medium transition-colors ${form.unit === 'Und' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Und
            </button>
            <button
              onClick={() => setForm(prev => ({ ...prev, unit: 'Kg' }))}
              className={`px-3 py-2 text-sm font-medium transition-colors ${form.unit === 'Kg' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Kg
            </button>
          </div>
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
                      className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <div className="flex rounded-lg overflow-hidden border border-gray-300">
                      <button
                        onClick={() => setEditForm(prev => ({ ...prev, unit: 'Und' }))}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${editForm.unit === 'Und' ? 'bg-green-700 text-white' : 'bg-white text-gray-600'}`}
                      >Und</button>
                      <button
                        onClick={() => setEditForm(prev => ({ ...prev, unit: 'Kg' }))}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${editForm.unit === 'Kg' ? 'bg-green-700 text-white' : 'bg-white text-gray-600'}`}
                      >Kg</button>
                    </div>
                    <input
                      type="number"
                      value={editForm.unitPrice}
                      onChange={e => setEditForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      placeholder="USD"
                    />
                    <button onClick={() => saveEdit(item.id)} className="text-green-600 hover:text-green-700"><Check size={18} /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.unit ?? 'Und'} × ${item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-green-700 text-sm">${(item.quantity * item.unitPrice).toFixed(2)}</p>
                    {rates.bcv && (
                      <p className="text-xs text-gray-400">Bs {formatBs(item.quantity * item.unitPrice, rates.bcv)}</p>
                    )}
                  </div>
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

      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
