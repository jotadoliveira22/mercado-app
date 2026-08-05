#!/usr/bin/env node
/**
 * Importa "Base_precios_supermercados_v4.xlsx" a las tablas catalog_*.
 *
 * Uso:
 *   npm run import:catalog -- ruta/al/archivo.xlsx
 *   npm run import:catalog -- ruta/al/archivo.xlsx --dry-run
 *
 * Requiere en .env:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * El catálogo es de solo lectura para los usuarios (ver catalog_schema.sql),
 * así que la importación necesita la service role key.
 *
 * Antes de correrlo, aplicar en Supabase:
 *   db/catalog_schema.sql
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizeProduct } from '../src/utils/categorize.ts';
import { leerLibro, filasAObjetos } from './lib/xlsx-reader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';

// Hojas de catálogo. 'Resumen' y 'Diccionario de datos' no son datos.
const SKIP_SHEETS = new Set(['Resumen', 'Diccionario de datos']);

/**
 * La fuente etiqueta 8.404 filas como BSD, pero se verificó que los valores
 * están en la misma escala que las filas marcadas USD: "Harina Pan Gluten Free
 * 1Kg" vale 1.35 en ambas. La etiqueta BSD del sitio es incorrecta, así que
 * todos los precios se tratan como USD y se conserva `moneda_fuente` para
 * poder auditarlo.
 */
const TRATAR_TODO_COMO_USD = true;

/**
 * Respaldo de categoría cuando `categorizeProduct` devuelve 'Otros'.
 *
 * El categorizador de la app deja 1.611 productos (27%) en 'Otros' porque no
 * reconoce familias como afeitado, depilatorias ni alimento de mascotas. En
 * esos casos la categoría del archivo es mejor que nada.
 *
 * Solo se mapean las equivalencias inequívocas. VÍVERES, REFRIGERADOS y
 * HOGAR Y TEMPORADA agrupan cosas muy distintas entre sí (VÍVERES incluye
 * desde pasta hasta bebidas), así que forzarlas a una sola de las 22
 * categorías de la app sería inventar precisión que el dato no tiene.
 */
const CATEGORIA_RESPALDO = {
  'CUIDADO PERSONAL': 'Higiene Personal',
  'ARTÍCULOS DE LIMPIEZA': 'Limpieza',
  'FRUTERÍA Y VEGETALES': 'Frutas y Verduras',
  'LICORES': 'Bebidas',
};

/** Categoría de la app: el categorizador manda; el archivo es el respaldo. */
function resolverCategoria(nombre, categoriaArchivo) {
  const propia = categorizeProduct(nombre);
  if (propia !== 'Otros') return propia;
  return CATEGORIA_RESPALDO[String(categoriaArchivo ?? '').trim()] ?? 'Otros';
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(s) {
  return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Fechas del archivo vienen como '2026-07-29 10:56:54' o con fracciones y
 * ' UTC'. Algunas hojas las guardan como fecha real de Excel, así que llegan
 * como Date: hay que cubrir ambos casos o se pierden filas en silencio.
 */
function parseFecha(raw) {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString();
  const s = String(raw ?? '').replace(' UTC', '').trim();
  const d = new Date(s.replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Una fila es utilizable si tiene nombre real y precio positivo.
 * Se omiten las 2.378 filas PARCIAL: conservan precio y SKU pero su nombre es
 * "PRODUCTO SIN NOMBRE PUBLICADO", inservible para comparar o buscar.
 */
function esUtilizable(r) {
  const nombre = String(r['Nombre del producto'] ?? '');
  const precio = Number(r['Precio actual']);
  return (
    r['Calidad del dato'] !== 'PARCIAL' &&
    !nombre.toUpperCase().includes('SIN NOMBRE') &&
    nombre.trim().length > 0 &&
    Number.isFinite(precio) &&
    precio > 0
  );
}

/**
 * Clave que une un producto con sus precios dentro de este script.
 *
 * Existe como funcion unica a proposito: antes se construia en tres lugares por
 * separado y una copia uso un separador distinto, asi que ninguna fila cruzaba
 * y el CSV salia vacio. El delimitador es visible para que una divergencia asi
 * se note al leer el codigo.
 */
function claveProducto(retailerId, claveFuente) {
  return `${retailerId}|${claveFuente}`;
}

/**
 * Número o null. El caso vacío se descarta ANTES de convertir porque
 * `Number('')` y `Number(null)` dan 0: sin esta guarda, un precio de oferta
 * ausente se guardaba como $0 en vez de quedar nulo.
 */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Depuración del formato consolidado ───────────────────────────────────────

/**
 * Prefijos técnicos que la fuente antepone a algunos nombres: "//Amlodipino",
 * "!!Base Monreve". No son parte del nombre y estorban al buscar.
 */
function limpiarNombre(nombre) {
  return String(nombre ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/**
 * Precio redondeado a céntimos, o null si no es utilizable.
 *
 * Farmatodo llega con el 100% de los precios sin redondear —$24.23242831768587—
 * porque la fuente divide entre una tasa de cambio y no ajusta. Las otras
 * cadenas vienen con dos decimales.
 *
 * Además hay un valor centinela, 0.00001335487920511759, repetido 207 veces en
 * productos sin relación entre sí (un antihipertensivo, galletas Oreo, un
 * cortaúñas). No es un precio sino una marca de "sin dato", así que todo lo que
 * redondee por debajo de un céntimo se descarta.
 */
function precioDepurado(valor) {
  const n = num(valor);
  if (n === null || !(n > 0)) return null;
  const redondeado = Math.round(n * 100) / 100;
  return redondeado >= 0.01 ? redondeado : null;
}

/**
 * Categorías de Farmatodo que se importan.
 *
 * Es una farmacia: 8.397 de sus 10.515 productos son cuidado personal y
 * medicinas, que no se comparan contra un supermercado. Se traen los víveres,
 * la limpieza y los refrigerados —carnes, lácteos y huevos—, que sí son
 * comparables.
 */
const FARMATODO_CATEGORIAS = new Set(['VÍVERES', 'ARTÍCULOS DE LIMPIEZA', 'REFRIGERADOS']);

// ── Lectura del Excel ────────────────────────────────────────────────────────

/**
 * Detecta el formato del archivo.
 *
 * El consolidado (v10 en adelante) trae una hoja "Base general" con todas las
 * cadenas y las columnas ya declaradas en USD. El formato anterior repartía las
 * cadenas en una hoja por sucursal.
 */
function detectarFormato(libro) {
  return 'Base general' in libro ? 'consolidado' : 'por-hojas';
}

function leerFilas(rutaXlsx) {
  const libro = leerLibro(rutaXlsx);
  const formato = detectarFormato(libro);
  const filas = [];
  const omitidas = { parcial: 0, sinPrecio: 0, precioRoto: 0, farmaciaNoComparable: 0 };

  if (formato === 'consolidado') {
    for (const r of filasAObjetos(libro['Base general'], 3)) {
      const nombre = limpiarNombre(r['Nombre del producto']);
      const sku = r['SKU'] ? String(r['SKU']).trim() : '';
      if (!nombre && !sku) continue;
      if (!nombre || nombre.toUpperCase().includes('SIN NOMBRE')) { omitidas.parcial++; continue; }

      const precio = precioDepurado(r['Precio actual (USD)']);
      if (precio === null) { omitidas.precioRoto++; continue; }

      const cadena = String(r['Establecimiento'] ?? '').trim();
      const categoria = String(r['Categoría estandarizada'] ?? '').trim();
      if (cadena === 'Farmatodo' && !FARMATODO_CATEGORIAS.has(categoria)) {
        omitidas.farmaciaNoComparable++;
        continue;
      }

      filas.push({
        'Supermercado': cadena,
        'Sucursal': r['Sucursal'],
        'SKU': sku || null,
        'ID producto web': null,
        'Nombre del producto': nombre,
        'Presentación': r['Presentación'],
        'Precio actual': precio,
        'Precio regular': precioDepurado(r['Precio regular (USD)']),
        'Precio oferta': precioDepurado(r['Precio oferta (USD)']),
        'Descuento': null,
        'Moneda fuente': 'USD',
        'Disponible': r['Disponible'],
        'Estado stock': r['Estado stock'],
        'Categoría original': r['Categoría original'],
        'Categoría estandarizada': categoria,
        'Calidad del dato': r['Calidad del dato'],
        'Observaciones': null,
        'URL del producto': r['URL del producto'],
        'URL de imagen': null,
        'Fecha de extracción': r['Fecha de extracción'],
        'Fuente': r['Fuente'],
        _hoja: 'Base general',
      });
    }
    return { filas, omitidas, formato };
  }

  for (const [nombreHoja, filasHoja] of Object.entries(libro)) {
    if (SKIP_SHEETS.has(nombreHoja)) continue;
    // Las 3 primeras líneas son título, subtítulo y nota; la 4ª es la cabecera.
    const crudas = filasAObjetos(filasHoja, 3);
    for (const r of crudas) {
      if (!r['Nombre del producto'] && !r['SKU']) continue;
      if (!esUtilizable(r)) {
        if (r['Calidad del dato'] === 'PARCIAL' || String(r['Nombre del producto'] ?? '').toUpperCase().includes('SIN NOMBRE')) {
          omitidas.parcial++;
        } else {
          omitidas.sinPrecio++;
        }
        continue;
      }
      filas.push({ ...r, _hoja: nombreHoja });
    }
  }
  return { filas, omitidas, formato };
}

// ── Transformación ───────────────────────────────────────────────────────────

function transformar(filas) {
  const retailers = new Map();
  const branches = new Map();
  const products = new Map(); // clave: claveProducto(retailerId, claveFuente)
  const precios = [];

  for (const r of filas) {
    const retailerId = slug(r['Supermercado']);
    const branchId = `${retailerId}:${slug(r['Sucursal'])}`;

    retailers.set(retailerId, {
      id: retailerId,
      nombre: String(r['Supermercado']).trim(),
      // Los nombres del archivo coinciden con los del selector de la app tras
      // renombrar El Plaza → Automercados Plaza y agregar Luvebras.
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
    // 525 filas (PedidosYa) no exponen SKU; se identifican por nombre para que
    // el mismo producto no se duplique entre sucursales.
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
        // Se reclasifica con el categorizador de la app para que la Comparativa
        // use las mismas 22 categorías que ve el usuario en el resto de la app.
        categoria_app: resolverCategoria(nombre, r['Categoría estandarizada']),
        barcode: null, // los SKU no son EAN; se llenará con el tiempo
        url_producto: r['URL del producto'] ?? null,
        url_imagen: r['URL de imagen'] ?? null,
      });
    }

    const fecha = parseFecha(r['Fecha de extracción']);
    if (!fecha) continue;

    precios.push({
      _pk: pk,
      // Datos del producto TAL COMO VIENEN EN ESTA FILA, para el volcado a CSV.
      // No se reusan los del producto deduplicado porque varios campos son
      // propios de la sucursal: la URL del producto, por ejemplo, cambia entre
      // Bello Monte y Plaza Las Americas aunque el SKU sea el mismo.
      _fila: {
        nombre,
        nombre_normalizado: nombreNorm,
        id_producto_web: r['ID producto web'] ? String(r['ID producto web']) : null,
        presentacion: r['Presentación'] ?? null,
        categoria_fuente: r['Categoría original'] ?? null,
        categoria_estandar: r['Categoría estandarizada'] ?? null,
        categoria_app: resolverCategoria(nombre, r['Categoría estandarizada']),
        url_producto: r['URL del producto'] ?? null,
        url_imagen: r['URL de imagen'] ?? null,
      },
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

// ── Salida a CSV (camino sin terminal) ───────────────────────────────────────
//
// Genera un CSV plano para subirlo con el importador de Supabase y repartirlo
// con db/catalog_load_from_staging.sql. Sirve cuando no hay Node instalado en
// la máquina de quien importa, y evita tener que exponer la service role key.
//
// Reusa `transformar()` a propósito: tener una segunda implementación de la
// transformación ya causó una vez que se perdieran 762 filas en silencio.

const COLUMNAS_CSV = [
  'retailer_id', 'retailer_nombre', 'branch_id', 'branch_nombre', 'fuente_url',
  'clave_fuente', 'sku', 'id_producto_web', 'nombre', 'nombre_normalizado',
  'presentacion', 'categoria_fuente', 'categoria_estandar', 'categoria_app',
  'url_producto', 'url_imagen', 'precio_usd', 'precio_regular', 'precio_oferta',
  'descuento_pct', 'moneda_fuente', 'disponible', 'estado_stock', 'calidad',
  'observaciones', 'fecha_extraccion',
];

function csvValor(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function generarCsv({ retailers, branches, products, precios }) {
  const porId = new Map(retailers.map(r => [r.id, r]));
  const branchPorId = new Map(branches.map(b => [b.id, b]));
  const productoPorPk = new Map(
    products.map(p => [claveProducto(p.retailer_id, p.clave_fuente), p])
  );

  const lineas = [COLUMNAS_CSV.join(',')];
  for (const pr of precios) {
    const p = productoPorPk.get(pr._pk);
    if (!p) continue;
    const r = porId.get(p.retailer_id);
    const b = branchPorId.get(pr.branch_id);
    const fila = {
      retailer_id: p.retailer_id,
      retailer_nombre: r?.nombre,
      branch_id: pr.branch_id,
      branch_nombre: b?.nombre,
      fuente_url: b?.fuente_url,
      clave_fuente: p.clave_fuente,
      sku: p.sku,
      // Campos propios de la fila: la deduplicación la hace la PARTE 2 del SQL,
      // así el CSV es un volcado fiel de lo que publicó cada sucursal.
      id_producto_web: pr._fila.id_producto_web,
      nombre: pr._fila.nombre,
      nombre_normalizado: pr._fila.nombre_normalizado,
      presentacion: pr._fila.presentacion,
      categoria_fuente: pr._fila.categoria_fuente,
      categoria_estandar: pr._fila.categoria_estandar,
      categoria_app: pr._fila.categoria_app,
      url_producto: pr._fila.url_producto,
      url_imagen: pr._fila.url_imagen,
      precio_usd: pr.precio_usd,
      precio_regular: pr.precio_regular,
      precio_oferta: pr.precio_oferta,
      descuento_pct: pr.descuento_pct,
      moneda_fuente: pr.moneda_fuente,
      disponible: pr.disponible === null ? '' : String(pr.disponible),
      estado_stock: pr.estado_stock,
      calidad: pr.calidad,
      observaciones: pr.observaciones,
      fecha_extraccion: pr.fecha_extraccion,
    };
    lineas.push(COLUMNAS_CSV.map(c => csvValor(fila[c])).join(','));
  }
  // BOM para que Excel abra los acentos correctamente.
  return '﻿' + lineas.join('\n') + '\n';
}

// ── Escritura en Supabase ────────────────────────────────────────────────────

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

async function upsertEnLotes(tabla, filas, conflicto, key, lote = 500) {
  for (let i = 0; i < filas.length; i += lote) {
    const chunk = filas.slice(i, i + lote);
    await sbRequest(`${tabla}?on_conflict=${conflicto}`, {
      body: chunk,
      key,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    process.stdout.write(`\r   ${tabla}: ${Math.min(i + lote, filas.length)}/${filas.length}`);
  }
  process.stdout.write('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const iCsv = args.indexOf('--csv');
  const rutaCsv = iCsv >= 0 ? args[iCsv + 1] : null;
  // El índice a saltar es el valor de --csv, y solo si la opción está presente:
  // con `indexOf` devolviendo -1, `iCsv + 1` da 0 y se descartaba el primer
  // argumento, que es precisamente la ruta del archivo.
  const saltar = iCsv >= 0 ? iCsv + 1 : -1;
  const ruta = args.filter((a, i) => !a.startsWith('--') && i !== saltar)[0];

  if (!ruta) {
    console.error(
      '❌ Falta la ruta del .xlsx\n\n' +
        '   npm run import:catalog -- archivo.xlsx              (importa a Supabase)\n' +
        '   npm run import:catalog -- archivo.xlsx --dry-run    (solo muestra qué haría)\n' +
        '   npm run import:catalog -- archivo.xlsx --csv salida.csv   (genera CSV para subir a mano)\n'
    );
    process.exit(1);
  }
  if (iCsv >= 0 && !rutaCsv) {
    console.error('❌ --csv necesita la ruta de salida: --csv catalogo.csv');
    process.exit(1);
  }
  if (!existsSync(ruta)) {
    console.error(`❌ No existe: ${ruta}`);
    process.exit(1);
  }

  console.log(`📖 Leyendo ${ruta}\n`);
  const { filas, omitidas, formato } = leerFilas(ruta);
  const { retailers, branches, products, precios } = transformar(filas);

  console.log(`   Formato detectado : ${formato}`);
  console.log(`   Filas utilizables : ${filas.length}`);
  console.log(`   Omitidas (sin nombre) : ${omitidas.parcial}`);
  console.log(`   Omitidas (precio)     : ${omitidas.sinPrecio + omitidas.precioRoto}`);
  if (omitidas.farmaciaNoComparable) {
    console.log(`   Omitidas (farmacia no comparable): ${omitidas.farmaciaNoComparable}`);
  }
  console.log(`\n   Cadenas    : ${retailers.length}`);
  console.log(`   Sucursales : ${branches.length}`);
  console.log(`   Productos  : ${products.length}`);
  console.log(`   Precios    : ${precios.length}`);

  console.log('\n   Por cadena:');
  for (const r of retailers) {
    const p = products.filter(x => x.retailer_id === r.id).length;
    console.log(`     ${r.nombre.padEnd(22)} ${String(p).padStart(6)} productos`);
  }

  console.log('\n   Top categorías reclasificadas:');
  const porCat = {};
  for (const p of products) porCat[p.categoria_app] = (porCat[p.categoria_app] ?? 0) + 1;
  for (const [c, n] of Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`     ${c.padEnd(30)} ${String(n).padStart(6)}`);
  }

  if (rutaCsv) {
    const csv = generarCsv({ retailers, branches, products, precios });
    writeFileSync(rutaCsv, csv, 'utf8');
    const filas = csv.split('\n').length - 2; // menos cabecera y salto final
    console.log(`\n📄 CSV escrito en ${rutaCsv} (${filas} filas)`);
    console.log('   Súbelo con: Table Editor → catalog_staging → Insert → Import data from CSV');
    console.log('   Luego corre db/catalog_load_from_staging.sql (PARTE 2).');
    return;
  }

  if (dryRun) {
    console.log('\n🔍 --dry-run: no se escribió nada en Supabase.');
    return;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error(
      '\n❌ Falta SUPABASE_SERVICE_ROLE_KEY en .env\n\n' +
        '   El catálogo es de solo lectura para los usuarios, así que la\n' +
        '   importación necesita la service role key.\n' +
        '   Supabase → Project Settings → API → service_role\n'
    );
    process.exit(1);
  }

  console.log('\n📤 Escribiendo en Supabase...');
  await upsertEnLotes('catalog_retailers', retailers, 'id', key);
  await upsertEnLotes('catalog_branches', branches, 'id', key);
  await upsertEnLotes('catalog_products', products, 'retailer_id,clave_fuente', key);

  // Los precios necesitan el id del producto, que lo asigna la base.
  console.log('   resolviendo ids de productos...');
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
    // _pk y _fila son auxiliares del script: PostgREST rechazaría columnas
    // que no existen en la tabla.
    const { _pk, _fila, ...resto } = p;
    filasPrecio.push({ product_id: id, ...resto });
  }
  if (huerfanos > 0) console.log(`   ⚠️  ${huerfanos} precios sin producto asociado (se omiten)`);

  await upsertEnLotes('catalog_prices', filasPrecio, 'product_id,branch_id,fecha_extraccion', key);

  console.log(`\n🎉 Importación completa: ${products.length} productos, ${filasPrecio.length} precios.`);
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
