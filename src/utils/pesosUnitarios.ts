import { normalizeName } from './priceKey';
import { categorizeProduct } from './categorize';

/**
 * Equivalencia entre unidades y peso, para productos vendidos por Kg.
 *
 * En la frutería el precio es por kilo, pero el usuario no tiene balanza a
 * mano: sabe que lleva 4 tomates, no que lleva 480 gramos. Esta tabla permite
 * estimar el peso —y por tanto el precio— a partir de la cantidad de piezas.
 *
 * ⚠️ Son PROMEDIOS, y la variación real es grande: un tomate puede pesar entre
 * 80 y 200 gramos. Por eso el resultado se muestra siempre con «≈» y el usuario
 * puede corregirlo; su corrección se guarda y sustituye a estos valores.
 *
 * Las claves más específicas van primero: "tomate perita" debe ganarle a
 * "tomate", porque las variedades pesan muy distinto.
 */

export interface PesoReferencia {
  /** Palabras que deben aparecer en el nombre del producto. */
  claves: string[];
  gramos: number;
}

export const PESOS_REFERENCIA: PesoReferencia[] = [
  // ── Variedades específicas primero ────────────────────────────────────────
  { claves: ['tomate', 'perita'], gramos: 90 },
  { claves: ['tomate', 'manzano'], gramos: 170 },
  { claves: ['tomate', 'frances'], gramos: 120 },
  { claves: ['papa', 'criolla'], gramos: 45 },
  { claves: ['auyama', 'barbara'], gramos: 1200 },
  { claves: ['ocumo', 'chino'], gramos: 250 },
  { claves: ['ocumo', 'blanco'], gramos: 200 },

  // ── Hortalizas y raíces ───────────────────────────────────────────────────
  { claves: ['tomate'], gramos: 120 },
  { claves: ['cebolla'], gramos: 150 },
  { claves: ['papa'], gramos: 150 },
  { claves: ['zanahoria'], gramos: 80 },
  { claves: ['remolacha'], gramos: 150 },
  { claves: ['berenjena'], gramos: 250 },
  { claves: ['calabacin'], gramos: 200 },
  { claves: ['chayota'], gramos: 250 },
  { claves: ['pepinillo'], gramos: 180 },
  { claves: ['pepino'], gramos: 200 },
  { claves: ['pimenton'], gramos: 150 },
  { claves: ['batata'], gramos: 200 },
  { claves: ['yuca'], gramos: 400 },
  { claves: ['ocumo'], gramos: 200 },
  { claves: ['apio'], gramos: 300 }, // apio criollo (raíz), no celery
  { claves: ['ajo'], gramos: 50 },   // cabeza de ajo
  { claves: ['auyama'], gramos: 1500 },
  { claves: ['repollo'], gramos: 900 },
  { claves: ['lechuga'], gramos: 400 },
  { claves: ['brocoli'], gramos: 400 },
  { claves: ['coliflor'], gramos: 600 },

  // ── Frutas ────────────────────────────────────────────────────────────────
  { claves: ['aguacate'], gramos: 250 },
  { claves: ['limon'], gramos: 60 },
  { claves: ['naranja'], gramos: 200 },
  { claves: ['mandarina'], gramos: 100 },
  { claves: ['manzana'], gramos: 180 },
  { claves: ['pera'], gramos: 180 },
  { claves: ['guayaba'], gramos: 120 },
  { claves: ['mango'], gramos: 250 },
  { claves: ['melocoton'], gramos: 150 },
  { claves: ['durazno'], gramos: 150 },
  { claves: ['ciruela'], gramos: 60 },
  { claves: ['kiwi'], gramos: 90 },
  { claves: ['parchita'], gramos: 90 },
  { claves: ['granadilla'], gramos: 100 },
  { claves: ['cambur'], gramos: 120 },
  { claves: ['platano'], gramos: 200 },
  { claves: ['melon'], gramos: 1500 },
  { claves: ['patilla'], gramos: 4000 },
  { claves: ['piña'], gramos: 1200 },
  { claves: ['pina'], gramos: 1200 },
  { claves: ['lechosa'], gramos: 1500 },
  { claves: ['coco'], gramos: 800 },
];

/**
 * Productos que se venden por Kg pero no se cuentan por unidad: nadie pide
 * "3 uvas" ni "2 vainitas". Ofrecer la conversión ahí sería absurdo.
 *
 * También la fruta deshidratada: "Orejón de Kiwi" es fruta, pero se vende a
 * granel y no en piezas contables.
 */
const NO_CONTABLES = [
  'uva', 'vainita', 'surtida', 'pasas', 'carbon', 'celery', 'perejil', 'cilantro',
  'orejon', 'deshidratad', 'fileteada', 'pelada', 'picad', 'rallad', 'trocead',
];

const CLAVE_AJUSTES = 'pesos-unitarios';

/** Correcciones del usuario, por nombre de producto normalizado. */
function leerAjustes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? '{}');
  } catch {
    return {};
  }
}

/** Guarda el peso real que midió el usuario, para no volver a estimarlo mal. */
export function guardarAjustePeso(nombreProducto: string, gramos: number) {
  if (!(gramos > 0)) return;
  try {
    const ajustes = leerAjustes();
    ajustes[normalizeName(nombreProducto)] = gramos;
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
  } catch {
    // Sin almacenamiento disponible: se sigue usando la tabla de referencia.
  }
}

export function olvidarAjustePeso(nombreProducto: string) {
  try {
    const ajustes = leerAjustes();
    delete ajustes[normalizeName(nombreProducto)];
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
  } catch { /* noop */ }
}

/** ¿El producto se vende por kilo? Se detecta por el nombre del catálogo. */
export function esPorKg(nombreProducto: string): boolean {
  const n = normalizeName(nombreProducto);
  return /(^|\s)kg(\s|$)/.test(n) || /por kilo/.test(n) || /(^|\s)kilo(s)?(\s|$)/.test(n);
}

/**
 * Peso aproximado de una pieza, en gramos, o null si no se puede estimar.
 *
 * Devuelve también si el valor viene de una corrección del usuario, para poder
 * distinguirlo en pantalla de una estimación de la tabla.
 */
export function pesoUnitario(nombreProducto: string): { gramos: number; ajustado: boolean } | null {
  const n = normalizeName(nombreProducto);

  const ajustes = leerAjustes();
  if (ajustes[n] > 0) return { gramos: ajustes[n], ajustado: true };

  if (NO_CONTABLES.some(p => n.includes(p))) return null;

  for (const ref of PESOS_REFERENCIA) {
    if (ref.claves.every(c => n.includes(c))) return { gramos: ref.gramos, ajustado: false };
  }
  return null;
}

/**
 * ¿Se puede convertir unidades a peso para este producto?
 *
 * Hacen falta tres condiciones, y la de categoría no es opcional: buscar solo
 * palabras dentro del nombre producía falsos positivos serios, como "Bologna
 * L Prado Pimentón y Aceituna KG" cruzando con "pimentón". Una mortadela no
 * se cuenta en piezas, y darle un peso estimado falsearía el total.
 */
export function admiteConversion(nombreProducto: string): boolean {
  if (!esPorKg(nombreProducto)) return false;
  if (categorizeProduct(nombreProducto) !== 'Frutas y Verduras') return false;
  return pesoUnitario(nombreProducto) !== null;
}

/** Kilos aproximados que representan N piezas. */
export function unidadesAKg(nombreProducto: string, unidades: number): number | null {
  const peso = pesoUnitario(nombreProducto);
  if (!peso || !(unidades > 0)) return null;
  return parseFloat(((peso.gramos * unidades) / 1000).toFixed(3));
}

/**
 * Cantidad por la que hay que multiplicar el precio, y peso estimado si hubo
 * conversión.
 *
 * Un producto por kilo se cobra por kilo aunque el usuario lo cuente en piezas:
 * 4 tomates a $2,45/Kg no cuestan $9,80 sino unos $0,88. Esta función es el
 * único sitio donde se decide eso, para que la Lista y el Carrito calculen
 * igual y no se contradigan.
 */
export function cantidadFacturable(
  nombreProducto: string,
  cantidad: number,
  unidad: string,
): { cantidad: number; kgEstimados: number | null } {
  if (unidad !== 'Und' || !admiteConversion(nombreProducto)) {
    return { cantidad, kgEstimados: null };
  }
  const kg = unidadesAKg(nombreProducto, cantidad);
  if (kg === null) return { cantidad, kgEstimados: null };
  return { cantidad: kg, kgEstimados: kg };
}

/** Texto corto del peso estimado: "≈ 480 g" o "≈ 1,2 Kg". */
export function formatearPeso(kg: number): string {
  if (kg < 1) return `≈ ${Math.round(kg * 1000)} g`;
  return `≈ ${kg.toFixed(kg < 10 ? 2 : 1).replace(/[.,]?0+$/, '')} Kg`;
}
