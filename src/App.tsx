import { useState } from 'react';
import { ShoppingCart, ShoppingBag, BarChart2, GitCompare } from 'lucide-react';
import ShoppingList from './components/ShoppingList';
import CostTracker from './components/CostTracker';
import Reports from './components/Reports';
import Comparativa from './components/Comparativa';

type Tab = 'list' | 'cart' | 'reports' | 'compare';

const TABS = [
  { id: 'list',    icon: ShoppingCart, label: 'Lista' },
  { id: 'cart',    icon: ShoppingBag,  label: 'Carrito' },
  { id: 'compare', icon: GitCompare,   label: 'Comparativa' },
  { id: 'reports', icon: BarChart2,    label: 'Reportes' },
] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('list');

  return (
    <div className="flex flex-col h-screen bg-[#f0fdf4] max-w-lg mx-auto relative">

      {/* Top header global */}
      <header className="bg-white border-b border-gray-100 shadow-sm flex-shrink-0 px-4 py-3 flex items-center gap-3">
        <img
          src="/Gemini_Generated_Image_5vn8ws5vn8ws5vn8.png"
          alt="MarktPlan"
          className="h-9 w-9 object-contain"
        />
        <div>
          <h1 className="text-[#166534] font-extrabold text-lg leading-tight">MarktPlan</h1>
          <p className="text-gray-400 text-[10px] leading-tight">Tu asistente de mercado</p>
        </div>
      </header>

      {/* Contenido */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'list'    && <ShoppingList />}
        {activeTab === 'cart'    && <CostTracker />}
        {activeTab === 'reports' && <Reports />}
        {activeTab === 'compare' && <Comparativa />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-100 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] flex-shrink-0 px-2 py-1">
        <div className="flex">
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-all"
              >
                <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-all ${active ? 'bg-[#166534]' : ''}`}>
                  <Icon size={18} className={active ? 'text-white' : 'text-gray-400'} />
                </div>
                <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-[#166534]' : 'text-gray-400'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
