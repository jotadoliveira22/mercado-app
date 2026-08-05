// Fuente única de los establecimientos. Antes estaba duplicada en
// CostTracker.tsx y Comparativa.tsx, lo que hacía fácil que se desincronizaran.

export const STORES = [
  'Gama', 'Automercados Plaza', 'Central Madeirense',
  'Unicasa', 'Luvebras', 'Rio Vida', 'Supermercados RIO', 'Farmatodo',
  'Supermercado Forum', 'Supermercado Luz', 'Supermercado Páramo',
];

/**
 * Nombres antiguos que cambiaron. Se usa para que los precios y compras ya
 * guardados con el nombre viejo sigan reconociéndose en la app hasta que la
 * migración de datos (db/rename_el_plaza.sql, db/rename_gama.sql) se haya
 * aplicado.
 */
export const STORE_ALIASES: Record<string, string> = {
  'Supermercado El Plaza': 'Automercados Plaza',
  'Supermercado Gama': 'Gama',
};

/** Devuelve el nombre vigente de un establecimiento. */
export function canonicalStore(name: string | null | undefined): string {
  if (!name) return '';
  return STORE_ALIASES[name] ?? name;
}

export const STORE_PLACEHOLDER = 'Seleccionar establecimiento';
