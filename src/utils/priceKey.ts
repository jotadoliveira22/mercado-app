/**
 * Claves con las que se identifica un producto en la tabla `store_prices`.
 *
 * Lo ideal es el código de barras. Cuando no lo hay (producto agregado a mano),
 * se cae a una clave derivada del nombre. El prefijo `name:` evita que un nombre
 * se confunda con un código de barras real.
 */

/** Minúsculas, sin acentos, espacios colapsados: "Café  Madrid" → "cafe madrid". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los diacríticos ya separados por NFD
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalización histórica: es la que usó `pushPricesToComparative` desde el
 * inicio, sin quitar acentos ni colapsar espacios. Se conserva solo para poder
 * seguir encontrando los precios ya guardados con ese formato.
 */
function legacyNameKey(name: string): string {
  return `name:${name.toLowerCase().trim()}`;
}

/** Clave canónica para GUARDAR un precio nuevo. */
export function priceKey(item: { barcode?: string; name: string }): string {
  if (item.barcode) return item.barcode;
  return `name:${normalizeName(item.name)}`;
}

/**
 * Claves a probar al BUSCAR un precio, en orden de preferencia. Incluye la
 * variante histórica para que los precios guardados antes de normalizar acentos
 * sigan apareciendo.
 */
export function priceKeyCandidates(item: { barcode?: string; name: string }): string[] {
  const keys = item.barcode ? [item.barcode] : [];
  keys.push(`name:${normalizeName(item.name)}`);
  const legacy = legacyNameKey(item.name);
  if (!keys.includes(legacy)) keys.push(legacy);
  return keys;
}
