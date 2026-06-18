export async function lookupBarcode(barcode: string): Promise<string> {
  // 1. Open Food Facts — español primero, mejor cobertura de productos latinoamericanos
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (res.ok) {
      const data = await res.json();
      const name = data?.product?.product_name_es || data?.product?.product_name || '';
      if (name) return name;
    }
  } catch { /* continúa */ }

  // 2. UPC Item DB — cubre productos importados y multinacionales (100 req/día gratis)
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
    if (res.ok) {
      const data = await res.json();
      const title = data?.items?.[0]?.title ?? '';
      if (title) return title;
    }
  } catch { /* continúa */ }

  // No encontrado — devuelve el código para que el usuario lo edite
  return '';
}
