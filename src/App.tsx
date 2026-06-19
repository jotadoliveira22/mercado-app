import { useState } from 'react';
import { ShoppingCart, Calculator, BarChart2 } from 'lucide-react';
import ShoppingList from './components/ShoppingList';
import CostTracker from './components/CostTracker';
import Reports from './components/Reports';

type Tab = 'list' | 'calculator' | 'reports';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('list');

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-lg mx-auto relative">
      <div className="flex-1 overflow-hidden">
        {activeTab === 'list' && <ShoppingList />}
        {activeTab === 'calculator' && <CostTracker />}
        {activeTab === 'reports' && <Reports />}
      </div>

      <nav className="bg-green-800 border-t border-green-700 flex-shrink-0">
        <div className="flex">
          {([
            { id: 'list', icon: ShoppingCart, label: 'Lista' },
            { id: 'calculator', icon: Calculator, label: 'Calculadora' },
            { id: 'reports', icon: BarChart2, label: 'Reportes' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-colors ${
                activeTab === id ? 'text-white bg-green-700' : 'text-green-300 hover:text-white hover:bg-green-700'
              }`}
            >
              <Icon size={22} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
