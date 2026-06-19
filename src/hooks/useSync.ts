import { supabase } from '../lib/supabase';
import type { ShoppingItem, TrackerItem, SavedPurchase } from '../types';

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
  }));
  const { error } = await supabase.from('saved_purchases').insert(rows);
  if (error) console.error('push saved_purchases:', error);
}
