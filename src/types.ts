export type Categoria =
  | 'Lácteos'
  | 'Carnes y Embutidos'
  | 'Frutas y Verduras'
  | 'Panadería y Cereales'
  | 'Bebidas'
  | 'Limpieza'
  | 'Higiene Personal'
  | 'Enlatados y Conservas'
  | 'Congelados'
  | 'Otros'

export interface ItemLista {
  id: string
  nombre: string
  categoria: Categoria
  comprado: boolean
  cantidad: number
}

export interface ItemCosto {
  id: string
  nombre: string
  cantidad: number
  precioUnitario: number
  codigoBarras?: string
}

export interface TasaCambio {
  bcv: number | null
  binance: number | null
  ultimaActualizacion: string | null
}
