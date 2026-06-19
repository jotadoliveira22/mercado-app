import type { Category } from '../types';

// Orden importa: las más específicas primero para evitar falsos positivos
const RULES: Array<{ category: Category; words: string[] }> = [
  {
    category: 'Charcutería',
    words: [
      'jamon', 'jamón', 'chistorra', 'chorizo', 'salami', 'mortadela',
      'pepperoni', 'peperoni', 'salchichon', 'salchichón', 'bologna',
      'bolonia', 'tocineta', 'tocino', 'bacon', 'butifarra', 'longaniza',
      'sobrasada', 'pate', 'paté', 'fiambre', 'charcuteria', 'charcutería',
      'jamon de pierna', 'jamon ahumado', 'jamon cocido', 'jamon serrano',
      'pechuga ahumada', 'pollo ahumado',
    ],
  },
  {
    category: 'Lácteos',
    words: [
      'leche', 'queso', 'yogur', 'yogurt', 'mantequilla', 'margarina',
      'crema de leche', 'nata', 'lacteo', 'lácteo', 'suero', 'cuajada',
      'ricotta', 'mozzarella', 'cheddar', 'parmesano', 'gouda', 'brie',
      'quesillo', 'doble crema', 'palmizulia', 'llanero',
    ],
  },
  {
    category: 'Carnes',
    words: [
      'pollo', 'res', 'cerdo', 'carne', 'bistec', 'chuleta', 'costilla',
      'pechuga', 'muslo', 'ala', 'pernil', 'lomo', 'pulpa', 'solomo',
      'lomito', 'lagarto', 'muchacho', 'ganso', 'paleta', 'pata',
      'pescado', 'atun', 'atún', 'sardina', 'salmon', 'salmón', 'bagre',
      'cazon', 'cazón', 'camarones', 'langostino', 'marisco', 'tilapia',
      'mero', 'corvina', 'trucha', 'salchicha', 'víscera', 'higado',
      'hígado', 'mondongo', 'molida', 'molido',
    ],
  },
  {
    category: 'Frutas y Verduras',
    words: [
      'tomate', 'cebolla', 'ajo', 'papa', 'papas', 'zanahoria', 'lechuga',
      'manzana', 'naranja', 'platano', 'plátano', 'aguacate', 'pimenton',
      'pimentón', 'apio', 'brocoli', 'brócoli', 'espinaca', 'fruta',
      'verdura', 'vegetal', 'pepino', 'cilantro', 'perejil', 'celery',
      'repollo', 'remolacha', 'berenjena', 'calabacin', 'calabacín',
      'calabaza', 'melon', 'melón', 'sandia', 'sandía', 'piña', 'mango',
      'lechosa', 'papaya', 'guayaba', 'parchita', 'maracuya', 'maracuyá',
      'fresa', 'uva', 'pera', 'durazno', 'melocotón', 'cereza', 'kiwi',
      'limon', 'limón', 'mandarina', 'toronja', 'cambur', 'banana',
      'ocumo', 'yuca', 'batata', 'ñame', 'maiz', 'maíz', 'choclo',
      'caraotas verdes', 'vainitas', 'guisantes', 'ajoporro',
    ],
  },
  {
    category: 'Cereales y Pastas',
    words: [
      'pasta', 'spaghetti', 'espagueti', 'fideos', 'macarron', 'macarrón',
      'arroz', 'avena', 'cereal', 'granola', 'cornflakes', 'musli',
      'quinoa', 'cuscus', 'polenta', 'semola', 'sémola',
    ],
  },
  {
    category: 'Panadería',
    words: [
      'pan ', 'panes', 'arepa', 'harina pan', 'harina de maiz', 'harina de trigo',
      'galleta', 'torta', 'pastel', 'bizcocho', 'croissant', 'baguette',
      'cachito', 'golfeado', 'tequeño', 'empanada', 'pastelito',
      'magdalena', 'muffin', 'donut', 'dona', 'rosquilla', 'waffle',
      'brownie', 'ponque', 'mantecada', 'bienmesabe',
    ],
  },
  {
    category: 'Bebidas',
    words: [
      'agua ', 'jugos', 'jugo ', 'refresco', 'gaseosa', 'soda', 'cola',
      'pepsi', 'coca', 'sprite', 'fanta', 'malta', 'cerveza', 'vino',
      'whisky', 'ron ', 'licor', 'café', 'cafe ', 'nescafe', 'té ', 'te ',
      'milo', 'cocoa', 'chocolate caliente', 'leche saborizada',
      'bebida', 'limonada', 'naranjada', 'guarana',
    ],
  },
  {
    category: 'Enlatados y Granos',
    words: [
      'lata', 'conserva', 'sopa', 'frijol', 'caraotas', 'lentejas',
      'garbanzos', 'maiz enlatado', 'atun enlatado', 'sardinas enlatadas',
      'caraota', 'frijoles', 'granos', 'arvejas', 'guisantes enlatados',
      'palmito', 'alcachofa', 'aceitunas', 'pepinillos',
    ],
  },
  {
    category: 'Condimentos',
    words: [
      'sal ', 'azucar', 'azúcar', 'aceite', 'vinagre', 'salsa', 'ketchup',
      'mostaza', 'mayonesa', 'picante', 'pimienta', 'comino', 'oregano',
      'orégano', 'canela', 'paprika', 'adobo', 'sazon', 'sazón',
      'cubito', 'maggi', 'soya', 'teriyaki', 'worcestershire', 'tabasco',
      'sofrito', 'onoto', 'curry', 'mermelada', 'miel', 'sirope',
      'mantequilla de mani', 'mani', 'nutella', 'pasta de tomate',
      'tomate frito', 'tomate triturado',
    ],
  },
  {
    category: 'Congelados',
    words: [
      'helado', 'pizza', 'nuggets', 'congelado', 'paleta', 'popsicle',
      'tater tots', 'papas fritas congeladas', 'croquetas congeladas',
    ],
  },
  {
    category: 'Limpieza',
    words: [
      'jabon', 'jabón', 'detergente', 'cloro', 'suavizante', 'esponja',
      'limpiador', 'desinfectante', 'escoba', 'trapeador', 'fabuloso',
      'pinesol', 'lysol', 'ajax', 'axion', 'liquido limpiavidrios',
      'limpiavidrios', 'quitamanchas', 'blanqueador', 'ambia', 'bala',
      'bolsa de basura', 'bolsas basura', 'guante', 'guantes',
    ],
  },
  {
    category: 'Higiene Personal',
    words: [
      'shampoo', 'champú', 'champu', 'pasta dental', 'crema dental',
      'cepillo dental', 'hilo dental', 'enjuague bucal', 'desodorante',
      'antitranspirante', 'papel higienico', 'papel sanitario', 'toalla sanitaria',
      'tampón', 'tampon', 'pañal', 'panal', 'toalla facial', 'servilleta',
      'locion', 'loción', 'crema corporal', 'perfume', 'colonia',
      'gel de baño', 'jabón corporal', 'afeitadora', 'maquinilla',
      'algodón', 'algodon', 'curitas', 'alcohol', 'agua oxigenada',
      'rastillo', 'gillette', 'pantene', 'head shoulders',
    ],
  },
];

export function categorizeProduct(name: string): Category {
  const lower = name.toLowerCase();

  for (const { category, words } of RULES) {
    for (const word of words) {
      if (lower.includes(word.trimEnd())) {
        return category;
      }
    }
  }

  return 'Otros';
}
