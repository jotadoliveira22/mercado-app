export type Category =
  | 'Lácteos'
  | 'Huevos'
  | 'Carnes y Aves'
  | 'Charcutería y Embutidos'
  | 'Pescados y Mariscos'
  | 'Frutas y Verduras'
  | 'Panadería y Repostería'
  | 'Cereales, Pastas y Harinas'
  | 'Aceites y Untables'
  | 'Salsas y Condimentos'
  | 'Enlatados y Conservas'
  | 'Snacks y Frutos Secos'
  | 'Dulces y Galletas'
  | 'Bebidas'
  | 'Café e Infusiones'
  | 'Congelados'
  | 'Comidas Preparadas'
  | 'Sopas y Caldos'
  | 'Limpieza'
  | 'Higiene Personal'
  | 'Mascotas'
  | 'Otros';

export type Unit = 'Und' | 'Kg';

export interface ShoppingItem {
  id: string;
  name: string;
  category: Category;
  checked: boolean;
  createdAt: number;
  quantity: number;
  unit: Unit;
}

export interface TrackerItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: Unit;
  category?: Category;
  barcode?: string;
}

export interface SavedPurchase {
  id: string;
  date: number;
  items: TrackerItem[];
  totalUSD: number;
  totalBCV: number | null;
  totalBinance: number | null;
  store?: string | null;
}

export interface ExchangeRates {
  bcv: number | null;
  usdt: number | null;
  lastUpdated: number | null;
}
