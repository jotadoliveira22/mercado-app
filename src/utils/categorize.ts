import type { Category } from '../types';

// Normaliza texto: minúsculas, sin tildes, sin caracteres especiales
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Para palabras simples exige límite de palabra; para frases usa substring
function matches(norm: string, words: string[]): boolean {
  return words.some(w => {
    const nw = normalize(w);
    if (nw.includes(' ')) {
      // Frase: coincidencia de subcadena exacta
      return norm.includes(nw);
    }
    // Palabra simple: debe estar rodeada de no-letras (evita "res" en "sobres")
    const re = new RegExp(`(^|[^a-z])${nw}([^a-z]|$)`);
    return re.test(norm);
  });
}

export function categorizeProduct(name: string): Category {
  const n = normalize(name);

  // ── PRIORIDAD 1: Mascotas ────────────────────────────────────────────────
  if (matches(n, [
    'perro', 'gato', 'mascota', 'pet', 'dog', 'cat', 'cachorro', 'kitten',
    'perrarina', 'gatarina', 'croquetas para', 'alimento para perro',
    'alimento para gato', 'treats', 'pedigree', 'whiskas', 'purina',
    'dog chow', 'cat chow', 'hueso masticable', 'snack dental para',
  ])) return 'Mascotas';

  // ── PRIORIDAD 2: Infantil → Otros ────────────────────────────────────────
  if (matches(n, [
    'bebe', 'infantil', 'etapa 1', 'etapa 2', 'etapa 3', 'formula infantil',
    'compota', 'papilla', 'colado', 'pure para bebe', 'cereal para bebe',
    'pouch infantil', 'puff infantil', 'nutrilon', 'nan ', 'similac',
  ])) return 'Otros';

  // ── PRIORIDAD 3: Congelados ──────────────────────────────────────────────
  if (matches(n, ['congelado', 'congelada', 'congelados', 'frozen', 'ultracongelado', 'prefrito', 'prefritas'])) {
    // Helados tienen tratamiento especial
    if (matches(n, ['helado', 'ice cream', 'paleta', 'sorbete', 'barquilla'])) return 'Congelados';
    return 'Congelados';
  }

  // ── PRIORIDAD 4: Conservas / enlatados ──────────────────────────────────
  if (matches(n, ['en lata', 'enlatado', 'en conserva', 'en almibar', 'en pouch', 'encurtido', 'en frasco'])) {
    return 'Enlatados y Conservas';
  }

  // ── PRIORIDAD 5: Sopas y caldos ──────────────────────────────────────────
  if (matches(n, [
    'sopa', 'caldo', 'consome', 'ramen', 'cup noodles', 'crema de pollo',
    'crema de champi', 'crema de tomate', 'crema de auyama', 'crema de esparragos',
    'base para sopa', 'sopa instantanea', 'sopa en sobre',
  ])) return 'Sopas y Caldos';

  // ── PRIORIDAD 6: Bebidas especiales (café, té, infusiones) ───────────────
  if (matches(n, [
    'cafe', 'espresso', 'capsula de cafe', 'cafe molido', 'cafe instantaneo',
    'te negro', 'te verde', 'te blanco', 'te chai', 'te en sobre', 'matcha',
    'manzanilla', 'tilo', 'hierbabuena', 'toronjil', 'flor de jamaica',
    'infusion', 'cacao en polvo', 'cocoa', 'chocolate en polvo', 'achocolatado en polvo',
    'nescafe', 'milo', 'nesquik',
  ])) return 'Café e Infusiones';

  // ── MASCOTAS (segunda pasada con marcas) ─────────────────────────────────

  // ── Lácteos ──────────────────────────────────────────────────────────────
  if (matches(n, [
    'leche', 'yogurt', 'yogur', 'queso', 'crema de leche', 'nata', 'mantequilla',
    'cuajada', 'ricotta', 'mozzarella', 'cheddar', 'parmesano', 'gouda',
    'quesillo', 'doble crema', 'suero de leche', 'bebida lactea', 'lacteo',
    'deslactosada', 'descremada', 'leche uht', 'leche en polvo', 'leche condensada',
    'leche evaporada', 'chicha lactea', 'merengada', 'palmizulia', 'caserola',
  ])) {
    // Excluir bebidas vegetales (soya, almendra, avena, coco como bebida)
    if (matches(n, ['almendra', 'soya', 'avena', 'coco']) &&
        matches(n, ['bebida', 'leche de', 'vegetal', 'plant'])) {
      return 'Bebidas';
    }
    return 'Lácteos';
  }

  // ── Huevos ───────────────────────────────────────────────────────────────
  if (matches(n, [
    'huevo', 'huevos', 'clara de huevo', 'yema', 'huevo liquido',
    'huevo pasteurizado', 'codorniz', 'omelette', 'carton de huevos',
  ])) return 'Huevos';

  // ── Charcutería y Embutidos ──────────────────────────────────────────────
  if (matches(n, [
    'jamon', 'mortadela', 'salchicha', 'chorizo', 'salchichon', 'tocineta',
    'bacon', 'pepperoni', 'peperoni', 'butifarra', 'longaniza', 'chistorra',
    'salami', 'pastrami', 'prosciutto', 'jamon serrano', 'lomo embuchado',
    'jamonilla', 'pate', 'bologna', 'bolonia', 'fiambre', 'charcuteria',
    'jamon de pierna', 'jamon cocido', 'jamon ahumado', 'pechuga ahumada',
    'pollo ahumado', 'pavo ahumado', 'corned beef',
  ])) return 'Charcutería y Embutidos';

  // ── Pescados y Mariscos ──────────────────────────────────────────────────
  if (matches(n, [
    'pescado', 'atun', 'sardina', 'salmon', 'merluza', 'camaron', 'langostino',
    'calamar', 'pulpo', 'marisco', 'anchoa', 'caballa', 'mero', 'pargo',
    'robalo', 'trucha', 'tilapia', 'bagre', 'cazon', 'corvina', 'surimi',
    'kani', 'bacalao', 'mejillon', 'almeja', 'vieira', 'cangrejo',
  ])) return 'Pescados y Mariscos';

  // ── Carnes y Aves ────────────────────────────────────────────────────────
  if (matches(n, [
    'pollo', 'carne', 'res', 'cerdo', 'bistec', 'chuleta', 'costilla',
    'pechuga', 'muslo', 'ala ', 'pernil', 'lomo', 'pulpa', 'solomo',
    'lomito', 'lagarto', 'muchacho', 'ganso', 'paleta de res', 'pata de res',
    'molida', 'molido', 'pavo', 'codorniz', 'alitas', 'contramuslo',
    'hamburguesa', 'albondiga', 'nuggets', 'milanesa', 'carne mechada',
    'pollo desmechado', 'higado', 'mondongo', 'viscera',
  ])) return 'Carnes y Aves';

  // ── Frutas y Verduras ────────────────────────────────────────────────────
  if (matches(n, [
    'tomate', 'cebolla', 'ajo', 'papa', 'zanahoria', 'lechuga', 'manzana',
    'naranja', 'platano', 'aguacate', 'pimenton', 'apio', 'brocoli',
    'espinaca', 'fruta', 'verdura', 'vegetal', 'pepino', 'cilantro',
    'perejil', 'repollo', 'remolacha', 'berenjena', 'calabacin', 'calabaza',
    'melon', 'sandia', 'pina', 'mango', 'lechosa', 'papaya', 'guayaba',
    'parchita', 'maracuya', 'fresa', 'uva', 'pera', 'durazno', 'cereza',
    'kiwi', 'limon', 'mandarina', 'toronja', 'cambur', 'banana', 'ocumo',
    'yuca', 'batata', 'name', 'maiz desgranado', 'choclo', 'vainitas',
    'ajoporro', 'coliflor', 'champi', 'hongo', 'esparragos', 'alcachofa',
    'palmito', 'ensalada mixta', 'mix de hojas', 'vegetales cortados',
  ])) return 'Frutas y Verduras';

  // ── Panadería y Repostería ───────────────────────────────────────────────
  if (matches(n, [
    'pan ', 'panes', 'arepa', 'baguette', 'canilla', 'pan de molde',
    'pan integral', 'pan arabe', 'pan pita', 'croissant', 'cachito',
    'golfeado', 'dona', 'donut', 'roles de canela', 'brioche', 'pan dulce',
    'torta', 'ponque', 'bizcocho', 'muffin', 'cupcake', 'brownie',
    'cheesecake', 'tres leches', 'marquesa', 'tequeño', 'empanada',
    'pastelito', 'masa de hojaldre', 'masa para pizza', 'cachapa',
    'wrap', 'tortilla de maiz', 'tortilla de trigo', 'arepita',
  ])) return 'Panadería y Repostería';

  // ── Cereales, Pastas y Harinas ──────────────────────────────────────────
  if (matches(n, [
    'arroz', 'pasta', 'spaghetti', 'espagueti', 'fideo', 'macarron',
    'linguini', 'fettuccine', 'plumitas', 'coditos', 'tornillos', 'lasagna seca',
    'avena', 'cereal', 'granola', 'corn flakes', 'musli', 'muesli',
    'quinoa', 'cuscus', 'polenta', 'semola',
    'harina', 'maicena', 'fecula', 'harina de maiz', 'harina de trigo',
    'harina leudante', 'harina de arroz', 'harina de yuca',
    'caraota', 'caraotas', 'frijol', 'lentejas', 'garbanzos', 'arvejas',
    'quinchoncho', 'habas', 'granos', 'mezcla para torta', 'mezcla para pancakes',
    'mezcla para brownie', 'mezcla para cachapas',
  ])) return 'Cereales, Pastas y Harinas';

  // ── Aceites y Untables ───────────────────────────────────────────────────
  if (matches(n, [
    'aceite', 'manteca', 'margarina', 'ghee', 'shortening', 'grasa vegetal',
    'mermelada', 'jalea', 'miel', 'dulce de leche', 'crema de chocolate',
    'crema de avellanas', 'nutella', 'sirope', 'jarabe de maple',
    'mantequilla de mani', 'crema de mani', 'hummus', 'pate de', 'tapenade',
    'aceite de oliva', 'aceite de maiz', 'aceite de girasol', 'aceite vegetal',
  ])) return 'Aceites y Untables';

  // ── Snacks y Frutos Secos ────────────────────────────────────────────────
  if (matches(n, [
    'papas fritas', 'platanitos', 'chips', 'nachos', 'chicharron', 'palitos salados',
    'cotufas', 'popcorn', 'palomitas', 'mani salado', 'mani japones',
    'almendras', 'merey', 'anacardo', 'nueces', 'pistacho', 'avellanas',
    'frutos secos', 'semillas de girasol', 'semillas de calabaza', 'chia',
    'linaza', 'ajonjoli', 'mix de semillas', 'snack', 'pasapalo',
    'yuca chips', 'tostones', 'banana chips', 'frutas deshidratadas',
    'garbanzos tostados',
  ])) return 'Snacks y Frutos Secos';

  // ── Dulces y Galletas ────────────────────────────────────────────────────
  if (matches(n, [
    'galleta', 'wafer', 'cracker', 'chocolate', 'bombon', 'trufa',
    'caramelo', 'chupeta', 'gomita', 'marshmallow', 'chicle', 'goma de mascar',
    'turron', 'oblea', 'barrita', 'barra de cereal', 'confite', 'dulce',
    'piruleta', 'tableta de chocolate', 'rellena con chocolate',
  ])) return 'Dulces y Galletas';

  // ── Bebidas ──────────────────────────────────────────────────────────────
  if (matches(n, [
    'agua ', 'agua mineral', 'agua gasificada', 'agua saborizada',
    'refresco', 'gaseosa', 'soda', 'cola', 'pepsi', 'coca cola', 'sprite',
    'fanta', 'malta', 'cerveza', 'vino', 'whisky', 'ron ', 'licor',
    'jugo', 'nectar', 'zumo', 'bebida de frutas', 'bebida en polvo',
    'sobre saborizado', 'concentrado', 'energy drink', 'energetica',
    'bebida deportiva', 'electrolit', 'guarana', 'limonada', 'naranjada',
    'te frio', 'iced tea', 'bebida vegetal', 'leche de almendra', 'leche de soya',
    'leche de avena', 'leche de coco',
  ])) return 'Bebidas';

  // ── Enlatados y Conservas ────────────────────────────────────────────────
  if (matches(n, [
    'lata', 'enlatado', 'conserva', 'almibar', 'encurtido', 'frasco',
    'aceitunas', 'pepinillos', 'alcaparras', 'cebollitas encurtidas',
    'jalapen', 'antipasto', 'maiz dulce', 'guisantes en', 'palmito',
    'tomates pelados', 'pimientos en',
  ])) return 'Enlatados y Conservas';

  // ── Comidas Preparadas ───────────────────────────────────────────────────
  if (matches(n, [
    'listo', 'preparado', 'preparada', 'calentar', 'microondas',
    'sandwich', 'wrap listo', 'sushi', 'pizza lista', 'lasana lista',
    'hallaca', 'bowl preparado', 'plato listo', 'arroz listo',
    'comida lista', 'pollo desmechado preparado',
  ])) return 'Comidas Preparadas';

  // ── Helados / Congelados ─────────────────────────────────────────────────
  if (matches(n, [
    'helado', 'ice cream', 'paleta helada', 'barquilla', 'cono helado',
    'sorbete', 'torta helada', 'postre helado',
  ])) return 'Congelados';

  // ── Salsas y Condimentos ─────────────────────────────────────────────────
  if (matches(n, [
    'salsa', 'ketchup', 'catsup', 'mostaza', 'mayonesa', 'aderezo',
    'vinagreta', 'ranch', 'bbq', 'pesto', 'bechamel', 'pasta de tomate',
    'passata', 'salsa de tomate', 'salsa napolitana', 'picante', 'tabasco',
    'sriracha', 'aji picante', 'vinagre', 'sal ', 'sal marina', 'sal rosada',
    'cubito', 'caldo en cubo', 'sazonador', 'adobo', 'consome en polvo',
    'salsa inglesa', 'salsa de soya', 'pimienta', 'oregano', 'comino',
    'curry', 'curcuma', 'paprika', 'ajo en polvo', 'cebolla en polvo',
    'canela en polvo', 'laurel', 'onoto', 'sofrito', 'maggi', 'knorr',
    'azucar', 'panela', 'papelón', 'papelón',
  ])) return 'Salsas y Condimentos';

  // ── Limpieza ─────────────────────────────────────────────────────────────
  if (matches(n, [
    'jabon de lavar', 'jabon para lavar', 'detergente', 'cloro', 'suavizante',
    'esponja', 'limpiador', 'desinfectante', 'escoba', 'trapeador', 'fabuloso',
    'pinesol', 'lysol', 'ajax', 'axion', 'limpiavidrios', 'quitamanchas',
    'blanqueador', 'ambia', 'bolsa de basura', 'bolsas basura', 'guantes de goma',
    'lava platos', 'lavaloza', 'limpiatodo',
  ])) return 'Limpieza';

  // ── Higiene Personal ─────────────────────────────────────────────────────
  if (matches(n, [
    'shampoo', 'champu', 'acondicionador', 'pasta dental', 'crema dental',
    'cepillo dental', 'hilo dental', 'enjuague bucal', 'desodorante',
    'antitranspirante', 'papel higienico', 'papel sanitario', 'toalla sanitaria',
    'tampon', 'panal', 'pañal', 'toalla facial', 'servilleta', 'locion corporal',
    'crema corporal', 'perfume', 'colonia', 'gel de bano', 'jabon de bano',
    'jabon corporal', 'rastillo', 'gillette', 'maquinilla', 'algodon',
    'curitas', 'agua oxigenada', 'alcohol antiseptico', 'pantene', 'head',
    'dove', 'nivea', 'protector solar',
  ])) return 'Higiene Personal';

  return 'Otros';
}
