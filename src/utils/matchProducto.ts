import { normalizeName } from './priceKey';

/**
 * Emparejamiento de un producto contra el catálogo de un establecimiento.
 *
 * Hace falta porque el catálogo no tiene códigos de barras: los SKU son
 * códigos internos de cada cadena, no EAN. Así que un producto escaneado solo
 * puede cruzarse con el catálogo a través de su nombre, y los nombres no
 * coinciden literalmente ("Harina PAN" vs "Harina Pan Gluten Free 1Kg").
 *
 * El criterio es deliberadamente conservador: ante la duda no devuelve nada.
 * Es preferible dejar el precio en blanco a mostrar el de otro producto.
 */

export interface CandidatoCatalogo {
  nombre: string;
  nombreNorm: string;
  precio: number;
  presentacion?: string | null;
  urlImagen?: string | null;
}

export interface Coincidencia {
  candidato: CandidatoCatalogo;
  /** 0 a 1: proporción de palabras de la búsqueda halladas en el candidato. */
  score: number;
}

/** Palabras sin valor para distinguir un producto de otro. */
const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'por', 'y', 'e',
  'a', 'en', 'al', 'un', 'una', 'x',
]);

/**
 * Palabras de presentación: "1kg", "500gr", "2l", "140", "20und".
 * Se ignoran al comparar porque describen el envase, no el producto, y casi
 * nunca se escriben igual ("1L" en la lista, "1Lt" en el catálogo).
 */
const MEDIDA = /^\d+(\s*(kg|kgs|g|gr|grs|gramos|l|lt|lts|ml|cc|und|uds|u|rollos|hojas|sob|sobres|pack|x)?)$/;

function esMedida(token: string): boolean {
  return MEDIDA.test(token) || /^\d/.test(token);
}

/** Unidades equivalentes, para que "1L" del usuario cruce con "1Lt" del catálogo. */
const UNIDAD_CANONICA: Record<string, string> = {
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  g: 'g', gr: 'g', grs: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', cc: 'ml',
  und: 'und', uds: 'und', u: 'und', unid: 'und',
};

/** "1Lt" → "1l", "500GR" → "500g". Devuelve null si no es una medida. */
function canonizarMedida(token: string): string | null {
  const m = token.match(/^(\d+)\s*([a-z]*)$/);
  if (!m) return null;
  const unidad = UNIDAD_CANONICA[m[2]] ?? m[2];
  return `${m[1]}${unidad}`;
}

/** Medidas presentes en un nombre, ya canonizadas. */
function medidas(nombre: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(nombre, true)) {
    if (!esMedida(t)) continue;
    const c = canonizarMedida(t);
    if (c) out.add(c);
  }
  return out;
}

function tokens(nombre: string, incluirMedidas = false): string[] {
  return normalizeName(nombre)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !VACIAS.has(t) && (incluirMedidas || !esMedida(t)));
}

/**
 * Posición de la palabra dentro del candidato, o -1 si no está.
 *
 * La comparación es por palabra completa, sin aceptar prefijos. Permitirlos
 * producía falsos positivos claros: "papel higiénico Rosal" cruzaba con
 * "Papelón Los Rosales Pulverizado", porque "papel" es prefijo de "papelon" y
 * "rosal" de "rosales". Meter ese precio en el total del usuario es peor que
 * no mostrar ninguno.
 */
function posicion(palabra: string, tokensCandidato: string[]): number {
  return tokensCandidato.indexOf(palabra);
}

/**
 * Sugerencias para el buscador, mientras el usuario escribe.
 *
 * A diferencia de `mejorCoincidencia`, aquí sí se aceptan palabras a medias:
 * quien escribe "hari" espera ver "Harina Pan" antes de terminar. Por eso se
 * busca por subcadena y no por palabra completa.
 *
 * El orden importa más que el filtro: con 5.000 productos, "leche" trae
 * decenas, y lo útil es que las más parecidas aparezcan primero.
 */
export function buscarEnCatalogo(
  consulta: string,
  candidatos: CandidatoCatalogo[],
  limite = 12,
): CandidatoCatalogo[] {
  const texto = normalizeName(consulta);
  if (texto.length < 2) return [];
  const buscadas = texto.split(/\s+/).filter(Boolean);

  const puntuados: Array<{ c: CandidatoCatalogo; orden: number[] }> = [];

  for (const candidato of candidatos) {
    const nombre = candidato.nombreNorm;

    // Todas las palabras escritas deben aparecer, aunque sea a medias.
    let posiciones = 0;
    let todas = true;
    for (const palabra of buscadas) {
      const i = nombre.indexOf(palabra);
      if (i < 0) { todas = false; break; }
      posiciones += i;
    }
    if (!todas) continue;

    // Menor es mejor en cada criterio, en este orden:
    //  1. el nombre empieza por lo escrito ("harina pan" → "Harina Pan ...")
    //  2. alguna palabra del nombre empieza por lo escrito
    //  3. cuánto hay que avanzar en el nombre para encontrar lo escrito
    //  4. nombre más corto, que suele ser el producto base
    const empiezaIgual = nombre.startsWith(texto) ? 0 : 1;
    const empiezaPalabra = new RegExp(`(^|\\s)${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(nombre) ? 0 : 1;
    puntuados.push({ c: candidato, orden: [empiezaIgual, empiezaPalabra, posiciones, nombre.length] });
  }

  puntuados.sort((a, b) => {
    for (let i = 0; i < a.orden.length; i++) {
      if (a.orden[i] !== b.orden[i]) return a.orden[i] - b.orden[i];
    }
    return 0;
  });

  return puntuados.slice(0, limite).map(p => p.c);
}

/**
 * Devuelve la mejor coincidencia del catálogo para un nombre, o null si
 * ninguna alcanza el umbral de confianza.
 */
export function mejorCoincidencia(
  consulta: string,
  candidatos: CandidatoCatalogo[],
): Coincidencia | null {
  const buscadas = tokens(consulta);
  if (buscadas.length === 0 || candidatos.length === 0) return null;

  // Las medidas no deciden si hay coincidencia, pero sí cuál de varias es la
  // buena: sin esto, "Coca Cola 2L" terminaba emparejada con un six pack de
  // 355ml, cuadruplicando el precio.
  const medidasBuscadas = medidas(consulta);

  let mejor:
    | { c: Coincidencia; medidaOk: boolean; primeraPos: number; nTokens: number }
    | null = null;

  for (const candidato of candidatos) {
    const tc = tokens(candidato.nombreNorm);
    if (tc.length === 0) continue;

    let aciertos = 0;
    let primeraPos = Number.MAX_SAFE_INTEGER;
    for (const palabra of buscadas) {
      const pos = posicion(palabra, tc);
      if (pos < 0) continue;
      aciertos++;
      if (pos < primeraPos) primeraPos = pos;
    }
    // Se exige que TODAS las palabras buscadas estén en el candidato. Aceptar
    // coincidencias parciales cruzaba "Papel higiénico Rosal" con "Papel
    // Higiénico Tessa": encontraba "papel" e "higienico" pero no la marca, que
    // es justo lo que distingue un producto de otro. Un precio de otra marca en
    // el total del usuario es peor que ningún precio.
    const score = aciertos / buscadas.length;
    if (score < 1) continue;

    // ¿Comparte la presentación con lo que buscó el usuario?
    const medidaOk =
      medidasBuscadas.size === 0 ||
      [...medidas(candidato.nombreNorm)].some(m => medidasBuscadas.has(m));

    const gana =
      mejor === null ||
      // 1º la presentación pedida, 2º la palabra buscada más al principio del
      // nombre ("Leche Carnation" antes que "Crema de Leche"), 3º el nombre más
      // corto, que suele ser el producto base y no una variante.
      (medidaOk && !mejor.medidaOk) ||
      (medidaOk === mejor.medidaOk && primeraPos < mejor.primeraPos) ||
      (medidaOk === mejor.medidaOk && primeraPos === mejor.primeraPos && tc.length < mejor.nTokens);

    if (gana) mejor = { c: { candidato, score }, medidaOk, primeraPos, nTokens: tc.length };
  }

  return mejor?.c ?? null;
}
