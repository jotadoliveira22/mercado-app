import { useState } from 'react';
import { ShoppingCart, Calculator } from 'lucide-react';
import ShoppingList from './components/ShoppingList';
import CostTracker from './components/CostTracker';

type Tab = 'list' | 'calculator';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('list');

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-lg mx-auto relative">
      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'list' ? <ShoppingList /> : <CostTracker />}
      </div>

      {/* Bottom Navigation */}
      <nav className="bg-green-800 border-t border-green-700 flex-shrink-0">
        <div className="flex">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-4 transition-colors ${
              activeTab === 'list'
                ? 'text-white bg-green-700'
                : 'text-green-300 hover:text-white hover:bg-green-700'
            }`}
          >
            <ShoppingCart size={22} />
            <span className="text-xs font-medium">Lista de Compras</span>
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-4 transition-colors ${
              activeTab === 'calculator'
                ? 'text-white bg-green-700'
                : 'text-green-300 hover:text-white hover:bg-green-700'
            }`}
          >
            <Calculator size={22} />
            <span className="text-xs font-medium">Calculadora</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
