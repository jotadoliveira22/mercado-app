/**
 * Transformación y escritura a Supabase compartidas entre `import-catalog.mjs`
 * (carga manual de un .xlsx) y los scrapers semanales (`scrape-and-publish.mjs`).
 *
 * Existe como módulo único a propósito: antes esta lógica estaba solo en
 * import-catalog.mjs; duplicarla para los scrapers arriesgaría repetir el bug
 * que ya perdió 762 filas por una segunda implementación desincronizada.
 *
 * Todas las filas de entrada, vengan de un Excel o de un scraper, deben tener
 * esta forma (mismas claves que usa la hoja "Base general" del consolidado):
 *   Supermercado, Sucursal, SKU, 'ID producto web', 'Nombre del producto',
 *   Presentación, 'Precio actual', 'Precio regular', 'Precio oferta',
 *   Descuento, 'Moneda fuente', Disponible, 'Estado stock',
 *   'Categoría original', 'Categoría estandarizada', 'Calidad del dato',
 *   Observaciones, 'URL del producto', 'URL de imagen', 'Fecha de extracción',
 *   Fuente
 */

import { categorizeProduct } from '../../src/utils/categorize.ts';

const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';

const CATEGORIA_RESPALDO = {
  'CUIDADO PERSONAL': 'Higiene Personal',
  'ARTÍCULOS DE LIMPIEZA': 'Limpieza',
  'FRUTERÍA Y VEGETALES': 'Frutas y Verduras',
  'LICORES': 'Bebidas',
};

export function resolverCategoria(nombre, categoriaArchivo) {
  const propia = categorizeProduct(nombre);
  if (propia !== 'Otros') return propia;
  return CATEGORIA_RESPALDO[String(categoriaArchivo ?? '').trim()] ?? 'Otros';
}

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(s) {
  return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function claveProducto(retailerId, claveFuente) {
  return `${retailerId}|${claveFuente}`;
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseFecha(raw) {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString();
  const s = String(raw ?? '').replace(' UTC', '').trim();
  const d = new Date(s.replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function transformar(filas) {
  const retailers = new Map();
  const branches = new Map();
  const products = new Map();
  const precios = [];

  for (const r of filas) {
    const retailerId = slug(r['Supermercado']);
    const branchId = `${retailerId}:${slug(r['Sucursal'])}`;

    retailers.set(retailerId, {
      id: retailerId,
      nombre: String(r['Supermercado']).trim(),
      app_store_name: String(r['Supermercado']).trim(),
      activo: true,
    });

    branches.set(branchId, {
      id: branchId,
      retailer_id: retailerId,
      nombre: String(r['Sucursal']).trim(),
      fuente_url: r['Fuente'] ?? null,
    });

    const nombre = String(r['Nombre del producto']).trim();
    const nombreNorm = normalize(nombre);
    const sku = r['SKU'] ? String(r['SKU']).trim() : null;
    const claveFuente = sku ?? nombreNorm;
    const pk = claveProducto(retailerId, claveFuente);

    if (!products.has(pk)) {
      products.set(pk, {
        retailer_id: retailerId,
        clave_fuente: claveFuente,
        sku,
        id_producto_web: r['ID producto web'] ? String(r['ID producto web']) : null,
        nombre,
        nombre_normalizado: nombreNorm,
        presentacion: r['Presentación'] ?? null,
        categoria_fuente: r['Categoría original'] ?? null,
        categoria_estandar: r['Categoría estandarizada'] ?? null,
        categoria_app: resolverCategoria(nombre, r['Categoría estandarizada']),
        barcode: null,
        url_producto: r['URL del producto'] ?? null,
        url_imagen: r['URL de imagen'] ?? null,
      });
    }

    const fecha = parseFecha(r['Fecha de extracción']);
    if (!fecha) continue;

    precios.push({
      _pk: pk,
      branch_id: branchId,
      precio_usd: num(r['Precio actual']),
      precio_regular: num(r['Precio regular']),
      precio_oferta: num(r['Precio oferta']),
      descuento_pct: num(r['Descuento']),
      moneda_fuente: r['Moneda fuente'] ?? null,
      disponible: r['Disponible'] === 'Sí' ? true : r['Disponible'] === 'No' ? false : null,
      estado_stock: r['Estado stock'] ?? null,
      calidad: r['Calidad del dato'] ?? null,
      observaciones: r['Observaciones'] ?? null,
      fecha_extraccion: fecha,
    });
  }

  return { retailers: [...retailers.values()], branches: [...branches.values()], products: [...products.values()], precios };
}

async function sbRequest(path, { method = 'POST', body, headers = {}, key }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export async function upsertEnLotes(tabla, filas, conflicto, key, lote = 500, log = console.log) {
  for (let i = 0; i < filas.length; i += lote) {
    const chunk = filas.slice(i, i + lote);
    await sbRequest(`${tabla}?on_conflict=${conflicto}`, {
      body: chunk,
      key,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    log(`\r   ${tabla}: ${Math.min(i + lote, filas.length)}/${filas.length}`);
  }
}

/**
 * Publica retailers → branches → products → precios en Supabase, en ese orden
 * (cada tabla depende de la anterior por llave foránea).
 */
export async function publicarEnSupabase({ retailers, branches, products, precios }, key, log = console.log) {
  await upsertEnLotes('catalog_retailers', retailers, 'id', key, 500, log);
  await upsertEnLotes('catalog_branches', branches, 'id', key, 500, log);
  await upsertEnLotes('catalog_products', products, 'retailer_id,clave_fuente', key, 500, log);

  log('   resolviendo ids de productos...');
  const idPorClave = new Map();
  const PAGE = 1000;
  for (let page = 0; ; page++) {
    const data = await sbRequest(
      `catalog_products?select=id,retailer_id,clave_fuente&limit=${PAGE}&offset=${page * PAGE}`,
      { method: 'GET', key }
    );
    for (const row of data) idPorClave.set(claveProducto(row.retailer_id, row.clave_fuente), row.id);
    if (data.length < PAGE) break;
  }

  const filasPrecio = [];
  let huerfanos = 0;
  for (const p of precios) {
    const id = idPorClave.get(p._pk);
    if (!id) { huerfanos++; continue; }
    const { _pk, ...resto } = p;
    filasPrecio.push({ product_id: id, ...resto });
  }
  if (huerfanos > 0) log(`   ⚠️  ${huerfanos} precios sin producto asociado (se omiten)`);

  await upsertEnLotes('catalog_prices', filasPrecio, 'product_id,branch_id,fecha_extraccion', key, 500, log);

  return { productos: products.length, precios: filasPrecio.length };
}
