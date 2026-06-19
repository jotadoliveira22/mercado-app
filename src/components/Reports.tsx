import { useState, useMemo } from 'react';
import { BarChart2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { SavedPurchase } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';

const CATEGORY_ICONS: Record<string, string> = {
  'Lácteos': '🥛', 'Carnes': '🥩', 'Charcutería': '🍖',
  'Frutas y Verduras': '🥦', 'Panadería': '🍞', 'Cereales y Pastas': '🍝',
  'Bebidas': '🥤', 'Condimentos': '🧂', 'Enlatados y Granos': '🥫',
  'Congelados': '🧊', 'Limpieza': '🧹', 'Higiene Personal': '🧴', 'Otros': '🛒',
};

const COLORS = [
  '#16a34a','#2563eb','#dc2626','#d97706','#7c3aed',
  '#db2777','#0891b2','#65a30d','#9333ea','#ea580c',
  '#0d9488','#be185d','#6b7280',
];

function PieChart({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  let angle = -90;
  const slices = data.map((d, i) => {
    const pct = d.value / total;
    const start = angle;
    angle += pct * 360;
    return { ...d, start, end: angle, pct, i };
  });

  const toXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) };
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-48 h-48">
        {slices.map((s) => {
          if (s.pct >= 0.999) {
            return <circle key={s.i} cx="50" cy="50" r="40" fill={s.color} />;
          }
          const p1 = toXY(s.start, 40);
          const p2 = toXY(s.end, 40);
          const large = s.end - s.start > 180 ? 1 : 0;
          return (
            <path
              key={s.i}
              d={`M50,50 L${p1.x},${p1.y} A40,40 0 ${large},1 ${p2.x},${p2.y} Z`}
              fill={s.color}
              stroke="white"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>
      <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1.5">
        {slices.map(s => (
          <div key={s.i} className="flex items-center gap-1.5 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-gray-600 truncate">{CATEGORY_ICONS[s.label] ?? ''} {s.label}</span>
            <span className="text-xs font-semibold text-gray-800 ml-auto flex-shrink-0">{(s.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PurchaseDetail({ purchase, onClose }: { purchase: SavedPurchase; onClose: () => void }) {
  const date = new Date(purchase.date);
  const fmt = new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Agrupar por categoría para el gráfico
  const byCategory: Record<string, number> = {};
  for (const item of purchase.items) {
    const cat = item.category ?? 'Otros';
    byCategory[cat] = (byCategory[cat] ?? 0) + item.quantity * item.unitPrice;
  }
  const pieData = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="bg-green-700 px-4 py-3 rounded-t-3xl flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-white font-bold text-base capitalize">{fmt.format(date)}</p>
            <p className="text-green-200 text-sm">${purchase.totalUSD.toFixed(2)} USD</p>
          </div>
          <button onClick={onClose} className="text-white"><X size={22} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Totales */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-green-50 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500">USD</p>
              <p className="font-bold text-green-700 text-sm">${purchase.totalUSD.toFixed(2)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500">BCV</p>
              <p className="font-bold text-green-700 text-sm">
                {purchase.totalBCV ? `Bs ${purchase.totalBCV.toLocaleString('es-VE', { maximumFractionDigits: 0 })}` : '—'}
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500">Binance</p>
              <p className="font-bold text-green-700 text-sm">
                {purchase.totalBinance ? `Bs ${purchase.totalBinance.toLocaleString('es-VE', { maximumFractionDigits: 0 })}` : '—'}
              </p>
            </div>
          </div>

          {/* Gráfico de torta */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Gasto por categoría</p>
            <PieChart data={pieData} />
          </div>

          {/* Lista de productos */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Productos ({purchase.items.length})</p>
            <div className="space-y-1">
              {purchase.items.map(item => (
                <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{CATEGORY_ICONS[item.category ?? 'Otros'] ?? '🛒'}</span>
                    <span className="text-sm text-gray-700 truncate">{item.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{item.quantity} {item.unit}</span>
                  </div>
                  <span className="text-sm font-semibold text-green-700 flex-shrink-0 ml-2">
                    ${(item.quantity * item.unitPrice).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Filter = 'mes' | 'semana' | 'todo';

export default function Reports() {
  const [purchases] = useLocalStorage<SavedPurchase[]>('saved-purchases', []);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selected, setSelected] = useState<SavedPurchase | null>(null);
  const [filter, setFilter] = useState<Filter>('mes');

  // Días con compras en el mes actual del calendario
  const purchaseDays = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchases) {
      const d = new Date(p.date);
      if (d.getFullYear() === calendarDate.getFullYear() && d.getMonth() === calendarDate.getMonth()) {
        set.add(d.getDate().toString());
      }
    }
    return set;
  }, [purchases, calendarDate]);

  // Compras filtradas para el resumen
  const filtered = useMemo(() => {
    const now = new Date();
    return purchases.filter(p => {
      const d = new Date(p.date);
      if (filter === 'mes') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (filter === 'semana') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }
      return true;
    }).sort((a, b) => b.date - a.date);
  }, [purchases, filter]);

  const totalFiltered = filtered.reduce((s, p) => s + p.totalUSD, 0);

  // Calendario
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = calendarDate.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

  const prevMonth = () => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleDayClick = (day: number) => {
    const clicked = new Date(year, month, day);
    const match = purchases.find(p => {
      const d = new Date(p.date);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });
    if (match) setSelected(match);
    void clicked;
  };

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-3">
          <h2 className="text-gray-800 font-bold text-base">Reportes</h2>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3 bg-[#f0fdf4]">
          <BarChart2 size={48} strokeWidth={1} />
          <p className="text-base">Sin compras guardadas</p>
          <p className="text-sm text-center px-8">Guarda tu primera compra desde la Calculadora</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-3 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-gray-800 font-bold text-base">Reportes</h2>
          <div className="bg-[#166534] rounded-full px-3 py-1">
            <span className="text-white text-xs font-bold">${totalFiltered.toFixed(2)}</span>
          </div>
        </div>
        {/* Filtros */}
        <div className="flex gap-2">
          {(['semana', 'mes', 'todo'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filter === f ? 'bg-[#166534] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {f === 'semana' ? 'Esta semana' : f === 'mes' ? 'Este mes' : 'Todo'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f0fdf4]">
        {/* Calendario */}
        <div className="bg-white mx-4 mt-4 rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="text-gray-400 hover:text-gray-600 p-1"><ChevronLeft size={18} /></button>
            <span className="text-sm font-semibold text-gray-700 capitalize">{monthName}</span>
            <button onClick={nextMonth} className="text-gray-400 hover:text-gray-600 p-1"><ChevronRight size={18} /></button>
          </div>
          {/* Días de la semana */}
          <div className="grid grid-cols-7 mb-1">
            {['D','L','M','X','J','V','S'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>
          {/* Días */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const hasPurchase = purchaseDays.has(day.toString());
              const today = new Date();
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`relative mx-auto w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors
                    ${hasPurchase ? 'bg-green-600 text-white font-bold' : isToday ? 'border-2 border-green-500 text-green-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">● Días con compra registrada</p>
        </div>

        {/* Lista de compras del filtro */}
        <div className="px-4 mt-4 pb-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
            {filtered.length} compra{filtered.length !== 1 ? 's' : ''}
          </p>
          {filtered.map(p => {
            const d = new Date(p.date);
            const dateStr = d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 text-left hover:border-green-200 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 capitalize">{dateStr}</p>
                    <p className="text-xs text-gray-400">{timeStr} · {p.items.length} productos</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700">${p.totalUSD.toFixed(2)}</p>
                    {p.totalBCV && (
                      <p className="text-xs text-gray-400">Bs {p.totalBCV.toLocaleString('es-VE', { maximumFractionDigits: 0 })}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && <PurchaseDetail purchase={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
