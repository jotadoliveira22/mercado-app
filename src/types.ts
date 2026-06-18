export type Category =
  | 'Lácteos'
  | 'Carnes'
  | 'Frutas y Verduras'
  | 'Panadería'
  | 'Bebidas'
  | 'Limpieza'
  | 'Higiene Personal'
  | 'Enlatados'
  | 'Congelados'
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
  barcode?: string;
}

export interface ExchangeRates {
  bcv: number | null;
  binance: number | null;
  lastUpdated: number | null;
}
