/**
 * Almacenamiento local con marca de cambios pendientes de subir.
 *
 * La app es «local primero»: lo que el usuario ve vive en el navegador y la
 * nube es una copia. Antes se sobrescribía lo local con lo de la nube en cada
 * evento de sesión, así que un cambio hecho sin señal —o mientras una subida
 * seguía en vuelo— desaparecía. La marca de pendiente evita justamente eso:
 * mientras exista, lo local manda y la nube no puede pisarlo.
 */

const PREFIJO_PENDIENTE = 'pending:';

export function leerLocal<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardarLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Cuota llena o modo privado: la app sigue funcionando en memoria.
  }
}

/** Marca que hay cambios locales que aún no llegaron a la nube. */
export function marcarPendiente(clave: string) {
  try { localStorage.setItem(PREFIJO_PENDIENTE + clave, '1'); } catch { /* noop */ }
}

export function limpiarPendiente(clave: string) {
  try { localStorage.removeItem(PREFIJO_PENDIENTE + clave); } catch { /* noop */ }
}

export function hayPendiente(clave: string): boolean {
  try { return localStorage.getItem(PREFIJO_PENDIENTE + clave) === '1'; } catch { return false; }
}
