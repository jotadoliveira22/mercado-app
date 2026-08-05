/**
 * Scraper de Automercados Plaza — sin API, se parsea el HTML de Magento.
 *
 * Puerto del extractor manual (extension de Chrome extractor.js) a Node, con
 * regex en vez de DOMParser porque no hay navegador disponible en el cron.
 *
 * ⚠️ Es el más frágil de los tres scrapers "sin navegador": depende de que
 * Magento siga usando las mismas clases CSS y atributos `data-price-amount`.
 * Si un cron falla con "0 productos" en esta tienda primero, revisar aquí.
 *
 * Las categorías se usan directas del extractor manual porque descubrir el
 * menú por regex es mucho más fràgil que sobre el DOM real; el extractor
 * manual mostró que estas cubren el catálogo completo.
 */

const TIENDAS = [
  { slug: 'vallearriba', nombre: 'Valle Arriba', base: 'https://vallearriba.elplazas.com' },
];

const CATEGORIAS = [
  ['IMBATIBLES', '/imbatibles.html'],
  ['FRUTAS Y VEGETALES', '/frutas-y-vegetales.html'],
  ['REFRIGERADOS Y CONGELADOS', '/refrigerados-y-congelados.html'],
  ['VÍVERES', '/viveres.html'],
  ['CUIDADO PERSONAL Y SALUD', '/cuidado-personal-y-salud.html'],
  ['LIMPIEZA', '/limpieza.html'],
  ['LICORES', '/licores.html'],
  ['MASCOTAS', '/mascotas.html'],
  ['HOGAR Y TEMPORADA', '/hogar-y-temporada.html'],
  ['OTROS', '/otros.html'],
];

const PRODUCTS_PER_PAGE = 45;
const MAX_PAGINAS_POR_CATEGORIA = 500;

function limpiar(texto) {
  return String(texto ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function descargarHtml(url) {
  const res = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (/just a moment|cf-chl-|verify you are human/i.test(html)) {
    throw new Error('la tienda solicitó verificación humana');
  }
  return html;
}

/**
 * Extrae las tarjetas `product-item-info` de una página de categoría.
 * Cada tarjeta se recorta entre inicios consecutivos del mismo marcador, así
 * que basta con encontrar los offsets y cortar el HTML entre ellos.
 */
function extraerTarjetas(html) {
  const marcador = /class="[^"]*product-item-info[^"]*"/g;
  const offsets = [];
  let m;
  while ((m = marcador.exec(html))) offsets.push(m.index);
  const tarjetas = [];
  for (let i = 0; i < offsets.length; i++) {
    const fin = i + 1 < offsets.length ? offsets[i + 1] : Math.min(html.length, offsets[i] + 6000);
    tarjetas.push(html.slice(offsets[i], fin));
  }
  return tarjetas;
}

function parsePrecio(texto) {
  const limpio = String(texto ?? '').replace(/[^\d.,-]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function parseTarjeta(tarjeta, categoria) {
  const nombreMatch = tarjeta.match(/product-item-link[^>]*>([^<]+)</) || tarjeta.match(/product-item-name[^>]*>\s*<a[^>]*>([^<]+)</);
  const nombre = limpiar(nombreMatch?.[1]);
  if (!nombre) return null;

  const skuMatch = tarjeta.match(/data-product-sku="([^"]+)"/);
  const sku = skuMatch ? limpiar(skuMatch[1]) : null;

  const hrefMatch = tarjeta.match(/product-item-link[^>]*href="([^"]+)"/);
  const url = hrefMatch?.[1] ?? null;

  // Magento embebe el precio numérico exacto en data-price-amount; se prefiere
  // sobre el texto visible, que trae separadores de miles inconsistentes.
  const precios = [...tarjeta.matchAll(/data-price-amount="([\d.]+)"/g)].map(m => Number(m[1])).filter(Number.isFinite);
  if (precios.length === 0) return null;

  const actual = Math.min(...precios);
  const regular = Math.max(...precios);
  const hayOferta = precios.length > 1 && regular > actual;

  const imgMatch = tarjeta.match(/(?:data-original|data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  const noDisponible = /class="[^"]*unavailable/i.test(tarjeta);

  return {
    'Supermercado': 'Automercados Plaza',
    'Sucursal': null, // se completa en scrape()
    'SKU': sku,
    'ID producto web': null,
    'Nombre del producto': nombre,
    'Presentación': null,
    'Precio actual': actual,
    'Precio regular': regular,
    'Precio oferta': hayOferta ? actual : null,
    'Descuento': hayOferta && regular > 0 ? Math.round((1 - actual / regular) * 10000) / 100 : null,
    'Moneda fuente': 'USD',
    'Disponible': noDisponible ? 'No' : 'Sí',
    'Estado stock': noDisponible ? 'Agotado' : 'Disponible',
    'Categoría original': categoria,
    'Categoría estandarizada': null,
    'Calidad del dato': null,
    'Observaciones': null,
    'URL del producto': url,
    'URL de imagen': imgMatch?.[1] ?? null,
    'Fecha de extracción': null, // se completa en scrape()
    'Fuente': null, // se completa en scrape()
  };
}

function totalPaginas(html) {
  const totalMatch = html.match(/toolbar-amount[^<]*<[^>]*>[\s\S]{0,120}?(?:de|of)\s+([\d.,]+)/i);
  if (totalMatch) {
    const total = Number(totalMatch[1].replace(/[^\d]/g, ''));
    if (total > 0) return Math.ceil(total / PRODUCTS_PER_PAGE);
  }
  const paginas = [...html.matchAll(/class="[^"]*\bpage\b[^"]*"[^>]*>\s*<span>(\d+)</g)].map(m => Number(m[1]));
  return paginas.length ? Math.max(...paginas) : 1;
}

async function scrapearCategoria(base, [nombre, ruta], sucursal, fechaExtraccion, log) {
  const url = (pagina) => `${base}${ruta}?product_list_limit=${PRODUCTS_PER_PAGE}&p=${pagina}`;
  const filas = [];

  let html;
  try {
    html = await descargarHtml(url(1));
  } catch (e) {
    log(`   ⚠️  ${nombre}: ${e.message}`);
    return filas;
  }

  const totalPag = Math.min(totalPaginas(html), MAX_PAGINAS_POR_CATEGORIA);

  for (let pagina = 1; pagina <= totalPag; pagina++) {
    if (pagina > 1) {
      try {
        html = await descargarHtml(url(pagina));
      } catch (e) {
        log(`   ⚠️  ${nombre} p.${pagina}: ${e.message}`);
        continue;
      }
      await new Promise(r => setTimeout(r, 180));
    }

    const tarjetas = extraerTarjetas(html);
    if (tarjetas.length === 0) break;

    for (const tarjeta of tarjetas) {
      const fila = parseTarjeta(tarjeta, nombre);
      if (!fila) continue;
      fila['Sucursal'] = sucursal.nombre;
      fila['Fecha de extracción'] = fechaExtraccion;
      fila['Fuente'] = sucursal.base;
      filas.push(fila);
    }
  }

  return filas;
}

/** @returns {Promise<object[]>} filas en el formato compartido de scrape-and-publish.mjs */
export async function scrape(log = console.log) {
  const filas = [];
  const fechaExtraccion = new Date().toISOString();

  for (const sucursal of TIENDAS) {
    log(`   Automercados Plaza · ${sucursal.nombre}...`);
    for (const categoria of CATEGORIAS) {
      const filasCategoria = await scrapearCategoria(sucursal.base, categoria, sucursal, fechaExtraccion, log);
      filas.push(...filasCategoria);
    }
    log(`   ${sucursal.nombre}: ${filas.length} productos (acumulado)`);
  }

  // Un mismo producto puede repetirse entre páginas; el SKU (o el nombre si no
  // hay SKU) desduplica igual que hace el extractor manual.
  const vistos = new Map();
  for (const fila of filas) {
    const clave = (fila['SKU'] || fila['Nombre del producto']).toLowerCase();
    if (!vistos.has(clave)) vistos.set(clave, fila);
  }
  return [...vistos.values()];
}
