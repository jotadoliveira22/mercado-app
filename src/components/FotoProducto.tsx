import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface Props {
  url?: string | null;
  alt: string;
  size?: number;
}

/**
 * Miniatura del producto, como en PedidosYa. Viene del catálogo (Central
 * Madeirense, Gama, etc.), no la sube el usuario.
 *
 * Si no hay URL, o la imagen falla al cargar (enlaces rotos son comunes en
 * catálogos scrapeados), se muestra un ícono neutro en vez de dejar un hueco
 * o el ícono roto del navegador.
 */
export default function FotoProducto({ url, alt, size = 44 }: Props) {
  const [fallo, setFallo] = useState(false);
  const estilo = { width: size, height: size };

  if (!url || fallo) {
    return (
      <div
        style={estilo}
        className="flex-shrink-0 rounded-xl bg-gray-100 flex items-center justify-center"
      >
        <ImageOff size={size * 0.4} className="text-gray-300" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      style={estilo}
      loading="lazy"
      onError={() => setFallo(true)}
      className="flex-shrink-0 rounded-xl object-cover bg-gray-100"
    />
  );
}
