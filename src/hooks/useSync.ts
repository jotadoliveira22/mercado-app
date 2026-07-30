import { supabase } from '../lib/supabase';
import type { ShoppingItem, TrackerItem, SavedPurchase } from '../types';
import { priceKey, normalizeName } from '../utils/priceKey';
import { canonicalStore } from '../constants/stores';

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Shopping Items ──────────────────────────────────────────────────────────

export async function fetchShoppingItems(): Promise<ShoppingItem[] | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.error('fetch shopping_items:', error); return null; }
  return data.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    checked: r.checked,
    createdAt: r.created_at,
    quantity: r.quantity,
    unit: r.unit,
    barcode: r.barcode ?? undefined,
  }));
}

export async function pushShoppingItems(items: ShoppingItem[]) {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('shopping_items').delete().eq('user_id', userId);
  if (items.length === 0) return;
  const rows = items.map(i => ({
    id: i.id,
    user_id: userId,
    name: i.name,
    category: i.category,
    checked: i.checked,
    created_at: i.createdAt,
    quantity: i.quantity,
    unit: i.unit,
    barcode: i.barcode ?? null,
  }));
  const { error } = await supabase.from('shopping_items').insert(rows);
  if (error) console.error('push shopping_items:', error);
}

// ── Tracker Items ───────────────────────────────────────────────────────────

export async function fetchTrackerItems(): Promise<TrackerItem[] | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('tracker_items')
    .select('*')
    .eq('user_id', userId);
  if (error) { console.error('fetch tracker_items:', error); return null; }
  return data.map(r => ({
    id: r.id,
    name: r.name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    unit: r.unit,
    category: r.category,
    barcode: r.barcode,
  }));
}

export async function pushTrackerItems(items: TrackerItem[]) {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('tracker_items').delete().eq('user_id', userId);
  if (items.length === 0) return;
  const rows = items.map(i => ({
    id: i.id,
    user_id: userId,
    name: i.name,
    quantity: i.quantity,
    unit_price: i.unitPrice,
    unit: i.unit,
    category: i.category ?? null,
    barcode: i.barcode ?? null,
  }));
  const { error } = await supabase.from('tracker_items').insert(rows);
  if (error) console.error('push tracker_items:', error);
}

// ── Saved Purchases ─────────────────────────────────────────────────────────

export async function fetchSavedPurchases(): Promise<SavedPurchase[] | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('saved_purchases')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) { console.error('fetch saved_purchases:', error); return null; }
  return data.map(r => ({
    id: r.id,
    date: r.date,
    items: r.items,
    totalUSD: r.total_usd,
    totalBCV: r.total_bcv,
    totalBinance: r.total_usdt,
    store: r.store ?? null,
  }));
}

export async function pushSavedPurchases(purchases: SavedPurchase[]) {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('saved_purchases').delete().eq('user_id', userId);
  if (purchases.length === 0) return;
  const rows = purchases.map(p => ({
    id: p.id,
    user_id: userId,
    date: p.date,
    items: p.items,
    total_usd: p.totalUSD,
    total_bcv: p.totalBCV,
    total_usdt: p.totalBinance,
    store: p.store ?? null,
  }));
  const { error } = await supabase.from('saved_purchases').insert(rows);
  if (error) console.error('push saved_purchases:', error);
}

// ── Store Prices (Comparativa) ───────────────────────────────────────────────

export async function pushPricesToComparative(items: TrackerItem[], store: string) {
  if (!store || items.length === 0) return;
  // Un upsert con dos filas de la misma clave falla ("cannot affect row a second
  // time"), así que se deja la última aparición de cada producto.
  //
  // Se excluyen los precios en 0: son productos traídos de la Lista que el
  // usuario no llegó a completar. Publicarlos ensuciaría la comparativa
  // compartida con precios falsos de $0.
  const byKey = new Map<string, TrackerItem>();
  for (const i of items) {
    if (!(i.unitPrice > 0)) continue;
    byKey.set(priceKey(i), i);
  }
  if (byKey.size === 0) return;
  const rows = [...byKey].map(([key, i]) => ({
    barcode: key,
    product_name: i.name,
    store,
    price_usd: i.unitPrice,
  }));
  const { error } = await supabase
    .from('store_prices')
    .upsert(rows, { onConflict: 'barcode,store' });
  if (error) console.error('push store_prices:', error);
}

// ── Búsqueda de precios por texto (Comparativa) ──────────────────────────────

export interface HitPrecio {
  /** De dónde viene el precio: el catálogo extraído o el aporte de un usuario. */
  origen: 'catalogo' | 'comunidad';
  establecimiento: string;
  nombre: string;
  precioUsd: number;
  presentacion?: string | null;
}

const LIMITE_BUSQUEDA = 40;

/**
 * Busca precios por texto en el catálogo y en los aportes de la comunidad.
 *
 * Se busca por subcadena, no por nombre exacto: los catálogos publican nombres
 * como "Harina Pan Mezcla Maiz Blanco y Arroz 1KG", así que buscar el texto
 * exacto que escribe el usuario no devuelve nada.
 */
export async function buscarPrecios(texto: string): Promise<HitPrecio[]> {
  const termino = normalizeName(texto);
  if (termino.length < 3) return [];
  const crudo = texto.trim().toLowerCase();

  const buscarComunidad = (patron: string) =>
    supabase
      .from('store_prices')
      .select('store,product_name,price_usd')
      .ilike('product_name', `%${patron}%`)
      .order('price_usd', { ascending: true })
      .limit(LIMITE_BUSQUEDA);

  // `catalog_products.nombre_normalizado` ya viene sin acentos, pero
  // `store_prices.product_name` guarda el nombre tal como lo escribió el
  // usuario. Por eso los aportes se buscan también con el texto crudo: si
  // alguien registró "Café Madrid", el término normalizado "cafe" no lo
  // encontraría.
  const patrones = crudo !== termino ? [termino, crudo] : [termino];

  // Las dos consultas van en una tupla, no en un array mezclado: así
  // TypeScript conserva el tipo de cada respuesta por separado.
  const [catalogo, respuestasComunidad] = await Promise.all([
    supabase
      .from('catalog_precio_vigente')
      .select('store,nombre,precio_usd,presentacion')
      .ilike('nombre_normalizado', `%${termino}%`)
      .order('precio_usd', { ascending: true })
      .limit(LIMITE_BUSQUEDA),
    Promise.all(patrones.map(buscarComunidad)),
  ]);

  if (catalogo.error) console.error('buscar catálogo:', catalogo.error);

  const hits: HitPrecio[] = [];

  for (const r of catalogo.data ?? []) {
    // `store` sale de app_store_name: si la cadena aún no se muestra en la app,
    // el precio no es comparable con lo que el usuario puede elegir.
    if (!r.store || typeof r.precio_usd !== 'number') continue;
    hits.push({
      origen: 'catalogo',
      establecimiento: r.store,
      nombre: r.nombre,
      precioUsd: r.precio_usd,
      presentacion: r.presentacion,
    });
  }

  // Las dos búsquedas de aportes pueden traer la misma fila, así que se
  // deduplica por establecimiento y producto.
  const vistos = new Set<string>();
  for (const respuesta of respuestasComunidad) {
    if (respuesta.error) { console.error('buscar store_prices:', respuesta.error); continue; }
    for (const r of respuesta.data ?? []) {
      if (!r.store || typeof r.price_usd !== 'number' || r.price_usd <= 0) continue;
      const clave = `${r.store}|${r.product_name}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      hits.push({
        origen: 'comunidad',
        establecimiento: canonicalStore(r.store),
        nombre: r.product_name ?? texto,
        precioUsd: r.price_usd,
      });
    }
  }

  return hits.sort((a, b) => a.precioUsd - b.precioUsd);
}

// ── Precios por establecimiento (para la Lista) ──────────────────────────────

/**
 * Trae todos los precios registrados de un establecimiento, indexados por su
 * clave. Se pide una sola vez por establecimiento en vez de una consulta por
 * producto.
 */
export async function fetchStorePrices(store: string): Promise<Map<string, number> | null> {
  if (!store) return null;
  const prices = new Map<string, number>();
  const PAGE = 1000; // PostgREST corta en 1000 filas
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('store_prices')
      .select('barcode,price_usd')
      .eq('store', store)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error('fetch store_prices:', error); return null; }
    for (const row of data) {
      if (typeof row.price_usd === 'number') prices.set(row.barcode, row.price_usd);
    }
    if (data.length < PAGE) break;
  }
  return prices;
}
