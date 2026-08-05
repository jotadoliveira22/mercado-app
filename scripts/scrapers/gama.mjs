/**
 * Scraper de Gama — API pública de SAP Commerce (hybris OCC).
 *
 * Puerto del extractor manual (extraer_gama_en_linea.ps1) a Node: mismo
 * endpoint (`products/search`), mismo warehouse por defecto. No requiere
 * navegador ni sesión.
 */

const API_BASE = 'https://api.cl94ncbhsi-excelsior1-p1-public.model-t.cc.commerce.ondemand.com/occ/v2/egb2c-spa';
const LANGUAGE = 'es';
const CURRENCY = 'REF';
const PAGE_SIZE = 100;

const SUCURSALES = [
  { code: 'S007', name: 'Gama Plus Santa Eduvigis' },
];

const FIELDS =
  'products(score,baseProduct,taxWithDiscount(formattedValue,value),seoName,code,name,summary,' +
  'configurable,configuratorType,multidimensional,price(FULL),images(FULL),stock(FULL),' +
  'averageRating,variantOptions,vatAmountPrice(formattedValue),' +
  'totalWithVatPrice(formattedValue,value),totalPriceWithNoDiscount(formattedValue),' +
  'basePriceWithDiscount(formattedValue),categories(code,name),' +
  'promotions(code,name,message,promotionType,labelColor,labelTextColor)),' +
  'facets,breadcrumbs,pagination(DEFAULT),sorts(DEFAULT),freeTextSearch,currentQuery';

const HEADERS = { Accept: 'application/json', 'Accept-Language': 'es-VE,es;q=0.9' };

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

async function buscarPagina(warehouse, pagina) {
  const params = new URLSearchParams({
    fields: FIELDS,
    query: ':relevance',
    currentPage: String(pagina),
    pageSize: String(PAGE_SIZE),
    lang: LANGUAGE,
    curr: CURRENCY,
    warehouse,
  });
  const url = `${API_BASE}/products/search?${params}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

function imagenPrincipal(imagenes) {
  const lista = Array.isArray(imagenes) ? imagenes : [];
  const principal =
    lista.find(i => i.imageType === 'PRIMARY' && i.format === 'product') ??
    lista.find(i => i.imageType === 'PRIMARY') ??
    lista[0];
  if (!principal?.url) return null;
  return principal.url.startsWith('http') ? principal.url : `${API_BASE}${principal.url}`;
}

function aFila(producto, sucursal, fechaExtraccion) {
  const actual = numero(producto.totalWithVatPrice?.value) ?? numero(producto.price?.value);
  if (actual === null || actual <= 0) return null;

  const regularTexto = producto.totalPriceWithNoDiscount?.formattedValue;
  const regular = numero(String(regularTexto ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  const tienePromo = (producto.promotions ?? []).length > 0;
  const hayDescuento = regular !== null && regular > actual;
  const regularFinal = hayDescuento ? regular : (tienePromo ? null : regular);

  const categorias = (producto.categories ?? []).map(c => c.name).filter(Boolean);
  const nombre = String(producto.name ?? '').trim();
  const slug = producto.seoName || nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const stockLevel = producto.stock?.stockLevel;
  const status = producto.stock?.stockLevelStatus ?? '';
  const disponible = /^(inStock|lowStock)$/.test(status) && !(stockLevel != null && Number(stockLevel) <= 0);

  return {
    'Supermercado': 'Gama',
    'Sucursal': sucursal.name,
    'SKU': producto.code ? String(producto.code) : null,
    'ID producto web': producto.code ? String(producto.code) : null,
    'Nombre del producto': nombre,
    'Presentación': null,
    'Precio actual': actual,
    'Precio regular': hayDescuento ? regularFinal : null,
    'Precio oferta': hayDescuento ? actual : null,
    'Descuento': hayDescuento && regularFinal > 0 ? Math.round((1 - actual / regularFinal) * 10000) / 100 : null,
    'Moneda fuente': producto.price?.currencyIso ?? null,
    'Disponible': disponible ? 'Sí' : 'No',
    'Estado stock': status || null,
    'Categoría original': categorias.join(' > '),
    'Categoría estandarizada': null,
    'Calidad del dato': null,
    'Observaciones': null,
    'URL del producto': `https://gamaenlinea.com/es/${slug}/p/${producto.code}`,
    'URL de imagen': imagenPrincipal(producto.images),
    'Fecha de extracción': fechaExtraccion,
    'Fuente': 'API pública de Gama en Línea',
  };
}

/** @returns {Promise<object[]>} filas en el formato compartido de scrape-and-publish.mjs */
export async function scrape(log = console.log) {
  const filas = [];
  const fechaExtraccion = new Date().toISOString();

  for (const sucursal of SUCURSALES) {
    log(`   Gama · ${sucursal.name}...`);
    let pagina = 0;
    let totalPaginas = 1;
    let vistos = 0;

    do {
      let respuesta;
      try {
        respuesta = await buscarPagina(sucursal.code, pagina);
      } catch (e) {
        log(`   ⚠️  Gama · ${sucursal.name}: falló la página ${pagina} (${e.message})`);
        break;
      }
      const productos = respuesta.products ?? [];
      for (const producto of productos) {
        const fila = aFila(producto, sucursal, fechaExtraccion);
        if (fila) filas.push(fila);
      }
      vistos += productos.length;
      if (respuesta.pagination?.totalPages != null) totalPaginas = Number(respuesta.pagination.totalPages);
      pagina++;
      await new Promise(r => setTimeout(r, 200));
    } while (pagina < totalPaginas);

    log(`   ${sucursal.name}: ${vistos} productos`);
  }

  return filas;
}
