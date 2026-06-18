const STORAGE_KEY = 'custom-products';

function getCustomDb(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveCustomProduct(barcode: string, name: string) {
  const db = getCustomDb();
  db[barcode] = name.trim();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

let veDb: Record<string, string> | null = null;
async function getVeDb(): Promise<Record<string, string>> {
  if (!veDb) {
    try {
      const res = await fetch('/products-ve.json');
      veDb = res.ok ? await res.json() : {};
    } catch {
      veDb = {};
    }
  }
  return veDb!;
}

export async function lookupBarcode(barcode: string): Promise<string> {
  // 1. Custom products saved by the user (priority over everything)
  const custom = getCustomDb();
  if (custom[barcode]) return custom[barcode];

  // 2. Venezuelan database
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
