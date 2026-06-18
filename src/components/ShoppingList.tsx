import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, ShoppingCart } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { categorizarProducto } from '../utils/categorizar'
import type { ItemLista, Categoria } from '../types'

const CATEGORIAS_ORDEN: Categoria[] = [
  'Frutas y Verduras',
  'Carnes y Embutidos',
  'Lácteos',
  'Panadería y Cereales',
  'Bebidas',
  'Enlatados y Conservas',
  'Congelados',
  'Limpieza',
  'Higiene Personal',
  'Otros',
]

const CATEGORIA_EMOJI: Record<Categoria, string> = {
  'Lácteos': '🥛',
  'Carnes y Embutidos': '🥩',
  'Frutas y Verduras': '🥦',
  'Panadería y Cereales': '🍞',
  'Bebidas': '🥤',
  'Limpieza': '🧹',
  'Higiene Personal': '🧴',
  'Enlatados y Conservas': '🥫',
  'Congelados': '🧊',
  'Otros': '🛒',
}

export default function ShoppingList() {
  const [items, setItems] = useLocalStorage<ItemLista[]>('lista-compras', [])
  const [input, setInput] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<Set<Categoria>>(
    new Set(CATEGORIAS_ORDEN),
  )

  const agregar = () => {
    const nombre = input.trim()
    if (!nombre) return
    const nuevo: ItemLista = {
      id: crypto.randomUUID(),
      nombre,
      categoria: categorizarProducto(nombre),
      comprado: false,
      cantidad,
    }
    setItems((prev) => [...prev, nuevo])
    setInput('')
    setCantidad(1)
  }

  const toggleComprado = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, comprado: !i.comprado } : i)),
    )
  }

  const eliminar = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const limpiarComprados = () => {
    setItems((prev) => prev.filter((i) => !i.comprado))
  }

  const toggleCategoria = (cat: Categoria) => {
    setCategoriasAbiertas((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const agrupados = CATEGORIAS_ORDEN.reduce<Record<Categoria, ItemLista[]>>(
    (acc, cat) => {
      acc[cat] = items.filter((i) => i.categoria === cat)
      return acc
    },
    {} as Record<Categoria, ItemLista[]>,
  )

  const totalItems = items.length
  const comprados = items.filter((i) => i.comprado).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart size={22} />
          <h1 className="text-lg font-bold">Lista de Compras</h1>
        </div>
        {totalItems > 0 && (
          <p className="text-green-200 text-sm">
            {comprados} de {totalItems} productos comprados
          </p>
        )}
        {totalItems > 0 && (
          <div className="w-full bg-green-900 rounded-full h-1.5 mt-2">
            <div
              className="bg-white h-1.5 rounded-full transition-all"
              style={{ width: `${(comprados / totalItems) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          placeholder="Agregar producto..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && agregar()}
        />
        <input
          type="number"
          min={1}
          className="w-14 border border-gray-300 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:border-green-500"
          value={cantidad}
          onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
        />
        <button
          onClick={agregar}
          className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-3 py-2 flex items-center gap-1 text-sm font-medium"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto pb-4">
        {totalItems === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ShoppingCart size={56} className="mb-3 opacity-30" />
            <p className="text-sm">Tu lista está vacía</p>
            <p className="text-xs mt-1">Agrega productos arriba</p>
          </div>
        )}

        {CATEGORIAS_ORDEN.map((cat) => {
          const catItems = agrupados[cat]
          if (catItems.length === 0) return null
          const abierta = categoriasAbiertas.has(cat)
          const catComprados = catItems.filter((i) => i.comprado).length

          return (
            <div key={cat} className="mt-2 mx-3">
              <button
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 rounded-xl"
                onClick={() => toggleCategoria(cat)}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <span>{CATEGORIA_EMOJI[cat]}</span>
                  {cat}
                  <span className="text-xs font-normal text-gray-400">
                    ({catComprados}/{catItems.length})
                  </span>
                </span>
                {abierta ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
              </button>

              {abierta && (
                <div className="mt-1 space-y-1">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 px-3 py-3 bg-white rounded-xl border ${
                        item.comprado ? 'border-green-100 opacity-60' : 'border-gray-100'
                      }`}
                    >
                      <button
                        onClick={() => toggleComprado(item.id)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          item.comprado
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {item.comprado && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${item.comprado ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {item.nombre}
                        {item.cantidad > 1 && (
                          <span className="ml-2 text-xs text-gray-400">x{item.cantidad}</span>
                        )}
                      </span>
                      <button
                        onClick={() => eliminar(item.id)}
                        className="text-gray-300 hover:text-red-400 p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {comprados > 0 && (
          <div className="px-4 mt-4">
            <button
              onClick={limpiarComprados}
              className="w-full py-2 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50"
            >
              Eliminar {comprados} producto{comprados > 1 ? 's' : ''} comprado{comprados > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
