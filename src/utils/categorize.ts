import type { Category } from '../types';

const categoryKeywords: Record<Category, string[]> = {
  'Lácteos': ['leche', 'queso', 'yogur', 'mantequilla', 'crema', 'nata', 'yogurt', 'lacteo', 'lácteo'],
  'Carnes': ['pollo', 'carne', 'res', 'cerdo', 'pescado', 'atún', 'atun', 'sardina', 'jamón', 'jamon', 'salchicha', 'bistec', 'chuleta'],
  'Frutas y Verduras': ['tomate', 'cebolla', 'ajo', 'papa', 'zanahoria', 'lechuga', 'manzana', 'naranja', 'plátano', 'platano', 'aguacate', 'pimentón', 'pimenton', 'apio', 'brócoli', 'brocoli', 'espinaca', 'fruta', 'verdura', 'vegetal'],
  'Panadería': ['pan', 'arepa', 'harina', 'galleta', 'torta', 'pastel', 'bizcocho', 'croissant', 'baguette'],
  'Bebidas': ['agua', 'jugo', 'refresco', 'café', 'cafe', 'té', 'te', 'cerveza', 'vino', 'bebida', 'gaseosa', 'soda', 'malta'],
  'Limpieza': ['jabón', 'jabon', 'detergente', 'cloro', 'suavizante', 'esponja', 'limpiador', 'desinfectante', 'escoba', 'trapeador', 'fabuloso'],
  'Higiene Personal': ['shampoo', 'champú', 'champu', 'pasta dental', 'cepillo', 'papel', 'desodorante', 'pañal', 'panal', 'toalla', 'servilleta', 'crema', 'loción', 'locion', 'perfume'],
  'Enlatados': ['lata', 'conserva', 'sopa', 'frijoles', 'caraotas', 'lentejas', 'garbanzos', 'maíz', 'maiz'],
  'Congelados': ['helado', 'pizza', 'nuggets', 'congelado', 'empanada'],
  'Otros': [],
};

export function categorizeProduct(name: string): Category {
  const lowerName = name.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords) as [Category, string[]][]) {
    if (category === 'Otros') continue;
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        return category;
      }
    }
  }
  return 'Otros';
}
