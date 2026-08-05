/**
 * Scraper de Central Madeirense — API pública de WooCommerce Store.
 *
 * Puerto del extractor manual (extraer_central_madeirense.ps1) a Node: mismo
 * endpoint (`/wp-json/wc/store/v1/products`), misma paginación, mismos campos.
 * No requiere navegador ni sesión.
 *
 * Cada sucursal es un subdominio/slug independiente de tucentralonline.com.
 * La lista de sucursales conocidas vive en SUCURSALES; se puede ampliar sin
 * tocar el resto del scraper.
 */

const SUCURSALES = [
  { slug: 'Bello-Monte-08', nombre: 'Bello Monte (08)' },
];

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
};

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function precioDecimal(valorMenor, decimales) {
  const n = numero(valorMenor);
  if (n === null) return null;
  return Math.round((n / 10 ** decimales) * 100) / 100;
}

async function descargarPagina(apiBase, pagina) {
  // La ruta de respaldo (?rest_route=...) ya trae un '?', así que agregar otro
  // rompería la URL: hay que usar '&' cuando ya existe uno.
  const separador = apiBase.includes('?') ? '&' : '?';
  const url = `${apiBase}${separador}per_page=100&page=${pagina}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(90000) });
  if (!res.ok) {
    if (pagina > 1 && res.status === 400) return [];
    throw new Error(`HTTP ${res.status} en ${url}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.products ?? []);
}

async function descargarCatalogo(apiBase) {
  const productos = [];
  for (let pagina = 1; ; pagina++) {
    const lote = await descargarPagina(apiBase, pagina);
    if (lote.length === 0) break;
    productos.push(...lote);
    if (lote.length < 100) break;
    await new Promise(r => setTimeout(r, 350));
  }
  return productos;
}

/** Convierte un producto de la API a una fila del formato compartido. */
function aFila(producto, sucursal, fechaExtraccion) {
  const precios = producto.prices ?? {};
  const decimales = Number.isFinite(Number(precios.currency_minor_unit)) ? Number(precios.currency_minor_unit) : 2;

  const actual = precioDecimal(precios.price, decimales);
  const regular = precioDecimal(precios.regular_price, decimales);
  const oferta = precioDecimal(precios.sale_price, decimales);
  if (actual === null || actual <= 0) return null;

  const descuento = regular && regular > 0 && actual !== null
    ? Math.round((1 - actual / regular) * 10000) / 100
    : null;

  const categorias = (producto.categories ?? []).map(c => c.name).filter(Boolean);
  const imagen = (producto.images ?? []).map(i => i.src).find(Boolean) ?? null;

  return {
    'Supermercado': 'Central Madeirense',
    'Sucursal': sucursal.nombre,
    'SKU': producto.sku ? String(producto.sku).trim() : null,
    'ID producto web': producto.id != null ? String(producto.id) : null,
    'Nombre del producto': String(producto.name ?? '').trim(),
    'Presentación': null,
    'Precio actual': actual,
    'Precio regular': regular,
    'Precio oferta': oferta,
    'Descuento': descuento,
    'Moneda fuente': precios.currency_code ?? 'USD',
    'Disponible': producto.is_in_stock ? 'Sí' : 'No',
    'Estado stock': producto.low_stock_remaining != null ? String(producto.low_stock_remaining) : null,
    'Categoría original': categorias.join(' > '),
    'Categoría estandarizada': null,
    'Calidad del dato': null,
    'Observaciones': null,
    'URL del producto': producto.permalink ?? null,
    'URL de imagen': imagen,
    'Fecha de extracción': fechaExtraccion,
    'Fuente': `https://tucentralonline.com/${sucursal.slug}`,
  };
}

/** @returns {Promise<object[]>} filas en el formato compartido de scrape-and-publish.mjs */
export async function scrape(log = console.log) {
  const filas = [];
  const fechaExtraccion = new Date().toISOString();

  for (const sucursal of SUCURSALES) {
    const base = `https://tucentralonline.com/${sucursal.slug}`;
    log(`   Central Madeirense · ${sucursal.nombre}...`);
    const apis = [
      `${base}/wp-json/wc/store/v1/products`,
      `${base}/?rest_route=/wc/store/v1/products`,
    ];

    let productos = [];
    let error = null;
    for (const api of apis) {
      try {
        productos = await descargarCatalogo(api);
        if (productos.length > 0) break;
      } catch (e) {
        error = e;
      }
    }
    if (productos.length === 0) {
      log(`   ⚠️  ${sucursal.nombre}: sin productos (${error?.message ?? 'catálogo vacío'})`);
      continue;
    }

    for (const producto of productos) {
      const fila = aFila(producto, sucursal, fechaExtraccion);
      if (fila) filas.push(fila);
    }
    log(`   ${sucursal.nombre}: ${productos.length} productos`);
  }

  return filas;
}
