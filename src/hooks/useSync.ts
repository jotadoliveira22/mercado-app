import { supabase } from '../lib/supabase';
import type { ShoppingItem, TrackerItem, SavedPurchase } from '../types';
import { priceKey } from '../utils/priceKey';

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
