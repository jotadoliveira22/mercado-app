const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaHZ3cmF1a3FhZWJld3l0bWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDkxMDksImV4cCI6MjA5NzM4NTEwOX0.kEYjPlnlOoNy70GmRaJic7-FhMxuCb3jFidx1aKebhU';
const CACHE_KEY = 'custom-products-cache';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// localStorage cache para evitar llamadas repetidas
function getCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function setCache(db: Record<string, string>) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(db));
}

// Guarda en Supabase (compartido) + cache local
export async function saveCustomProduct(barcode: string, name: string) {
  const trimmed = name.trim();
  // Cache local inmediato
  const cache = getCache();
  cache[barcode] = trimmed;
  setCache(cache);

  // Supabase upsert
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/custom_products`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ barcode, name: trimmed }),
    });
  } catch { /* si falla la red queda en cache local */ }
}

// Busca un código en Supabase
async function lookupSupabase(barcode: string): Promise<string | null> {
  // Primero revisa cache local
  const cache = getCache();
  if (cache[barcode]) return cache[barcode];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/custom_products?barcode=eq.${encodeURIComponent(barcode)}&select=name&limit=1`,
      { headers: HEADERS }
    );
    if (res.ok) {
      const rows = await res.json() as Array<{ name: string }>;
      if (rows.length > 0) {
        // Guarda en cache local para próximas veces
        cache[barcode] = rows[0].name;
        setCache(cache);
        return rows[0].name;
      }
    }
  } catch { /* sin red, continúa */ }
  return null;
}

// BD venezolana del Excel
let veDb: Record<string, string> | null = null;
async function getVeDb(): Promise<Record<string, string>> {
  if (!veDb) {
    try {
      const res = await fetch('/products-ve.json');
      veDb = res.ok ? await res.json() : {};
    } catch { veDb = {}; }
  }
  return veDb!;
}

export async function lookupBarcode(barcode: string): Promise<string> {
  // 1. Productos personalizados compartidos (Supabase + cache local)
  const custom = await lookupSupabase(barcode);
  if (custom) return custom;

  // 2. BD venezolana (Excel importado)
  const db = await getVeDb();
  if (db[barcode]) return db[barcode];

  // 3. Open Food Facts
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (res.ok) {
      const data = await res.json();
      const name = data?.product?.product_name_es || data?.product?.product_name || '';
      if (name) return name;
    }
  } catch { /* continúa */ }

  // 4. UPC Item DB
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
    if (res.ok) {
      const data = await res.json();
      const title = data?.items?.[0]?.title ?? '';
      if (title) return title;
    }
  } catch { /* continúa */ }

  return '';
}
