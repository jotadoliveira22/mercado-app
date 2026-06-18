import type { Categoria } from '../types'

const reglas: Array<{ categoria: Categoria; palabras: string[] }> = [
  {
    categoria: 'Lácteos',
    palabras: ['leche', 'queso', 'yogur', 'yogurt', 'mantequilla', 'crema', 'nata', 'lacteo', 'butter'],
  },
  {
    categoria: 'Carnes y Embutidos',
    palabras: ['pollo', 'carne', 'res', 'cerdo', 'pescado', 'atun', 'sardina', 'jamon', 'salchicha', 'mortadela', 'tocineta', 'bacon', 'chorizo', 'lomito', 'bistec', 'chuleta'],
  },
  {
    categoria: 'Frutas y Verduras',
    palabras: ['tomate', 'cebolla', 'ajo', 'papa', 'apio', 'zanahoria', 'lechuga', 'manzana', 'naranja', 'platano', 'aguacate', 'limon', 'fruta', 'verdura', 'vegetal', 'pimiento', 'pepino', 'celery', 'espinaca', 'broccoli', 'brocoli', 'melon', 'piña', 'mango', 'fresa'],
  },
  {
    categoria: 'Panadería y Cereales',
    palabras: ['pan', 'arepa', 'harina', 'galleta', 'torta', 'pastel', 'cereal', 'avena', 'granola', 'pasta', 'arroz', 'maiz', 'trigo', 'bizcocho'],
  },
  {
    categoria: 'Bebidas',
    palabras: ['agua', 'jugo', 'refresco', 'cafe', 'te', 'cerveza', 'vino', 'ron', 'whisky', 'bebida', 'gaseosa', 'limonada', 'maltin', 'malta'],
  },
  {
    categoria: 'Limpieza',
    palabras: ['jabon', 'detergente', 'cloro', 'suavizante', 'esponja', 'limpiador', 'desengrasante', 'quitagrasas', 'trapero', 'escoba', 'lavaplatos', 'fabuloso', 'lysol'],
  },
  {
    categoria: 'Higiene Personal',
    palabras: ['shampoo', 'champu', 'pasta dental', 'cepillo', 'papel', 'desodorante', 'pañal', 'toalla', 'higienico', 'servilleta', 'crema', 'locion', 'perfume', 'gel', 'afeitadora'],
  },
  {
    categoria: 'Enlatados y Conservas',
    palabras: ['lata', 'conserva', 'sopa', 'frijoles', 'caraotas', 'lentejas', 'garbanzos', 'maiz lata', 'salsa', 'ketchup', 'mostaza', 'mayonesa', 'mermelada'],
  },
  {
    categoria: 'Congelados',
    palabras: ['helado', 'pizza', 'nuggets', 'congelado', 'papas fritas', 'empanada', 'lasaña'],
  },
]

export function categorizarProducto(nombre: string): Categoria {
  const texto = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const regla of reglas) {
    for (const palabra of regla.palabras) {
      if (texto.includes(palabra)) return regla.categoria
    }
  }
  return 'Otros'
}
