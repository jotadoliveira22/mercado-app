#!/usr/bin/env node
/**
 * Rellena catalog_products.url_imagen visitando la página de cada producto
 * que ya tenemos guardada (catalog_products.url_producto), para cualquier
 * cadena que NO esté detrás de un WAF que bloquee peticiones simples.
 *
 * Sirve para Farmatodo, Central Madeirense y Gama: sus catálogos llegan sin
 * foto (el Excel v10 no traía esa columna, o el scraper semanal solo tocó
 * una sucursal y dejó el resto sin actualizar), pero las tres se pueden leer
 * con `fetch` normal — se confirmó con Farmatodo y con que el scraper
 * semanal de Central Madeirense/Gama ya usa fetch simple contra sus APIs.
 *
 * NO sirve para Automercados Plaza ni PedidosYa: esas sí están bloqueadas
 * (Plaza por un WAF tipo Cloudflare, PedidosYa por ser contenido que solo
 * existe tras ejecutar JavaScript) y necesitan navegador headless.
 *
 * Uso:
 *   npm run backfill:imagenes -- --retailer farmatodo --dry-run
 *   npm run backfill:imagenes -- --retailer central-madeirense --limit 50
 *   npm run backfill:imagenes -- --retailer gama
 *
 * Requiere en el entorno (.env local, o secreto de GitHub Actions):
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';
const TIMEOUT_MS = 15000;
// Central Madeirense empezó a responder HTTP 503 en cadena con
// concurrencia 5 y pausa 150ms — su hosting no aguanta ese ritmo. Bajado
// a un ritmo más conservador, con reintento cuando el sitio dice "espera".
const CONCURRENCIA = 2;
const PAUSA_MS = 500;
const REINTENTOS = 3;
const PAGE = 500;

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

async function sbRequest(path, { method = 'GET', body, headers = {}, key }) {
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

async function pendientes(key, retailer, limite) {
  const filas = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      select: 'id,url_producto',
      retailer_id: `eq.${retailer}`,
      url_imagen: 'is.null',
      url_producto: 'not.is.null',
      limit: String(Math.min(PAGE, limite ? limite - filas.length : PAGE)),
      offset: String(offset),
    });
    const data = await sbRequest(`catalog_products?${params}`, { key });
    filas.push(...data);
    if (data.length < PAGE || (limite && filas.length >= limite)) break;
  }
  return limite ? filas.slice(0, limite) : filas;
}

async function fetchConTope(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        // Sin esto, Node manda su propio identificador ("node") como
        // User-Agent: muchos sitios (o su WAF) lo tratan como bot y
        // responden 503 sin importar qué tan lento vayamos. Con un
        // User-Agent de navegador real, se ve como tráfico normal.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'es-VE,es;q=0.9',
      },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Igual que fetchConTope, pero si el sitio responde 429/503 ("estoy
 * saturado") espera y reintenta en vez de darlo por perdido de una — es
 * justo lo que le pasó a Central Madeirense: no bloqueó por completo, solo
 * pidió que bajáramos el ritmo.
 */
async function fetchConReintento(url) {
  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      return await fetchConTope(url);
    } catch (error) {
      ultimoError = error;
      if (!/HTTP (429|503)/.test(error.message)) throw error;
      await new Promise(r => setTimeout(r, 1000 * intento));
    }
  }
  throw ultimoError;
}

/** Misma lógica que extractor.js de Farmatodo: JSON-LD primero, og:image después. */
function extraerImagen(html) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, contenido] of scripts) {
    try {
      const parsed = JSON.parse(contenido);
      const cola = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (cola.length) {
        const item = cola.shift();
        if (!item || typeof item !== 'object') continue;
        if (Array.isArray(item['@graph'])) cola.push(...item['@graph']);
        if (String(item['@type'] || '').toLowerCase() === 'product' && item.image) {
          const img = Array.isArray(item.image) ? item.image[0] : item.image;
          if (typeof img === 'string' && img) return img;
        }
      }
    } catch { /* JSON-LD inválido: se ignora ese bloque */ }
  }
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1];
  return null;
}

async function procesar(fila, key, log) {
  try {
    const html = await fetchConReintento(fila.url_producto);
    const imagen = extraerImagen(html);
    if (!imagen) return { id: fila.id, encontrada: false };
    await sbRequest(`catalog_products?id=eq.${fila.id}`, {
      method: 'PATCH',
      key,
      headers: { Prefer: 'return=minimal' },
      body: { url_imagen: imagen },
    });
    return { id: fila.id, encontrada: true };
  } catch (error) {
    log(`   ⚠️  id=${fila.id}: ${error.message}`);
    return { id: fila.id, encontrada: false, error: true };
  }
}

async function mapConConcurrencia(items, limite, worker) {
  let siguiente = 0;
  let completados = 0;
  const corredores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      await worker(items[i]);
      completados++;
      if (completados % 50 === 0) {
        process.stdout.write(`\r   ${completados}/${items.length}`);
      }
      await new Promise(r => setTimeout(r, PAUSA_MS));
    }
  });
  await Promise.all(corredores);
  process.stdout.write(`\r   ${items.length}/${items.length}\n`);
}

const RETAILERS_PERMITIDOS = ['farmatodo', 'central-madeirense', 'gama'];

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const iLimit = args.indexOf('--limit');
  const limite = iLimit >= 0 ? Number(args[iLimit + 1]) : undefined;
  const iRetailer = args.indexOf('--retailer');
  const retailer = iRetailer >= 0 ? args[iRetailer + 1] : undefined;

  if (!retailer || !RETAILERS_PERMITIDOS.includes(retailer)) {
    console.error(
      `❌ Falta --retailer o no es válido. Usa uno de: ${RETAILERS_PERMITIDOS.join(', ')}\n\n` +
      '   Automercados Plaza y PedidosYa no están en esta lista a propósito:\n' +
      '   sus páginas están bloqueadas para fetch simple y necesitan navegador headless.\n'
    );
    process.exit(1);
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exit(1);
  }

  console.log(`🖼️  Relleno de fotos — ${retailer}\n`);
  console.log('Buscando productos sin foto...');
  const filas = await pendientes(key, retailer, limite);
  console.log(`   ${filas.length} productos sin foto, con página guardada.\n`);

  if (filas.length === 0) return;

  if (dryRun) {
    console.log('🔍 --dry-run: no se visitó ninguna página ni se escribió nada.');
    return;
  }

  console.log('Visitando páginas de producto...');
  const resultados = [];
  await mapConConcurrencia(filas, CONCURRENCIA, async (fila) => {
    resultados.push(await procesar(fila, key, console.log));
  });

  const encontradas = resultados.filter(r => r.encontrada).length;
  const errores = resultados.filter(r => r.error).length;
  console.log(`\n🎉 Listo: ${encontradas}/${filas.length} fotos encontradas y guardadas.`);
  if (errores > 0) console.log(`   ⚠️  ${errores} fallaron por red o timeout — quedan pendientes para la próxima corrida.`);
  const sinFoto = filas.length - encontradas - errores;
  if (sinFoto > 0) console.log(`   ℹ️  ${sinFoto} páginas no traían foto (ni JSON-LD ni og:image).`);
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
