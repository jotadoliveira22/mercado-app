import { useState } from 'react'
import { ShoppingCart, Calculator } from 'lucide-react'
import ShoppingList from './components/ShoppingList'
import CostTracker from './components/CostTracker'

type Tab = 'lista' | 'calculadora'

export default function App() {
  const [tab, setTab] = useState<Tab>('lista')

  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'lista' ? <ShoppingList /> : <CostTracker />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-200 flex safe-area-inset-bottom">
        <button
          onClick={() => setTab('lista')}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${
            tab === 'lista' ? 'text-green-700' : 'text-gray-400'
          }`}
        >
          <ShoppingCart size={22} />
          Lista de Compras
        </button>
        <button
          onClick={() => setTab('calculadora')}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${
            tab === 'calculadora' ? 'text-green-700' : 'text-gray-400'
          }`}
        >
          <Calculator size={22} />
          Calculadora
        </button>
      </nav>
    </div>
  )
}
