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
      <header className="bg-[#166534] flex-shrink-0 px-5 py-4 flex items-center gap-4 shadow-lg">
        <div className="bg-white rounded-2xl p-2 shadow-md flex-shrink-0">
          <img
            src="/logo.png"
            alt="MarktPlan"
            className="h-16 w-16 object-contain"
          />
        </div>
        <div>
          <h1 className="text-white font-extrabold text-2xl leading-tight tracking-tight">MarktPlan</h1>
          <p className="text-green-300 text-xs font-medium leading-tight">Tu asistente de mercado</p>
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
      <nav className="bg-[#166534] flex-shrink-0 px-2 py-1 shadow-[0_-2px_16px_rgba(0,0,0,0.2)]">
        <div className="flex">
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-all"
              >
                <div className={`flex items-center justify-center w-11 h-7 rounded-xl transition-all ${active ? 'bg-white' : ''}`}>
                  <Icon size={18} className={active ? 'text-[#166534]' : 'text-green-300'} />
                </div>
                <span className={`text-[10px] font-bold transition-colors ${active ? 'text-white' : 'text-green-400'}`}>
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
