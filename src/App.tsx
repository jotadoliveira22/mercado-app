import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, ShoppingBag, BarChart2, GitCompare, Cloud, CloudOff, Loader, LogOut } from 'lucide-react';
import ShoppingList from './components/ShoppingList';
import CostTracker from './components/CostTracker';
import Reports from './components/Reports';
import Comparativa from './components/Comparativa';
import AuthScreen from './components/AuthScreen';
import { supabase } from './lib/supabase';
import {
  fetchShoppingItems, pushShoppingItems,
  fetchTrackerItems, pushTrackerItems,
  fetchSavedPurchases, pushSavedPurchases,
} from './hooks/useSync';
import type { ShoppingItem, TrackerItem, SavedPurchase } from './types';
import {
  leerLocal, guardarLocal, marcarPendiente, limpiarPendiente, hayPendiente,
} from './utils/localStore';
import type { User } from '@supabase/supabase-js';

// Claves de almacenamiento local. Se centralizan para que el guardado, la marca
// de pendiente y el reintento usen siempre la misma.
const CLAVE_LISTA = 'shopping-items';
const CLAVE_CARRITO = 'tracker-items';
const CLAVE_COMPRAS = 'saved-purchases';

type Tab = 'list' | 'cart' | 'reports' | 'compare';
type SyncState = 'loading' | 'ok' | 'error';

const TABS = [
  { id: 'list',    icon: ShoppingCart, label: 'Lista' },
  { id: 'cart',    icon: ShoppingBag,  label: 'Carrito' },
  { id: 'compare', icon: GitCompare,   label: 'Comparativa' },
  { id: 'reports', icon: BarChart2,    label: 'Reportes' },
] as const;

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [syncState, setSyncState] = useState<SyncState>('loading');

  const [shoppingItems, setShoppingItemsRaw] = useState<ShoppingItem[]>(() => leerLocal(CLAVE_LISTA, []));
  const [trackerItems, setTrackerItemsRaw] = useState<TrackerItem[]>(() => leerLocal(CLAVE_CARRITO, []));
  const [savedPurchases, setSavedPurchasesRaw] = useState<SavedPurchase[]>(() => leerLocal(CLAVE_COMPRAS, []));

  // Listen to auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /** Reintenta subir lo que quedó pendiente (al volver la señal, o tras cargar). */
  const subirPendientes = useCallback(async () => {
    const tareas: Array<Promise<void>> = [];
    if (hayPendiente(CLAVE_LISTA)) {
      tareas.push(pushShoppingItems(leerLocal(CLAVE_LISTA, [])).then(() => limpiarPendiente(CLAVE_LISTA)));
    }
    if (hayPendiente(CLAVE_CARRITO)) {
      tareas.push(pushTrackerItems(leerLocal(CLAVE_CARRITO, [])).then(() => limpiarPendiente(CLAVE_CARRITO)));
    }
    if (hayPendiente(CLAVE_COMPRAS)) {
      tareas.push(pushSavedPurchases(leerLocal(CLAVE_COMPRAS, [])).then(() => limpiarPendiente(CLAVE_COMPRAS)));
    }
    if (tareas.length === 0) return;
    setSyncState('loading');
    try {
      await Promise.all(tareas);
      setSyncState('ok');
    } catch (err) {
      console.error('reintento de sync', err);
      setSyncState('error');
    }
  }, []);

  /**
   * Carga desde la nube al entrar, UNA sola vez por usuario.
   *
   * Antes esto dependía del objeto `user`, que Supabase reemplaza en cada
   * evento de sesión —refresco de token, volver a la app—. Cada uno de esos
   * eventos volvía a ejecutar la carga y pisaba lo que el usuario tenía en
   * pantalla con lo que hubiera en la nube: si acababa de agregar algo y la
   * subida seguía en vuelo, ese producto desaparecía.
   *
   * Ahora depende del id del usuario y una referencia recuerda cuál ya se
   * cargó, así que un refresco de token no dispara nada.
   */
  const usuarioCargado = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId || usuarioCargado.current === userId) return;
    usuarioCargado.current = userId;

    let cancelado = false;
    (async () => {
      setSyncState('loading');
      try {
        const [shopping, tracker, purchases] = await Promise.all([
          hayPendiente(CLAVE_LISTA) ? null : fetchShoppingItems(),
          hayPendiente(CLAVE_CARRITO) ? null : fetchTrackerItems(),
          hayPendiente(CLAVE_COMPRAS) ? null : fetchSavedPurchases(),
        ]);
        if (cancelado) return;
        // Solo se adopta lo de la nube cuando no hay cambios locales sin subir.
        // Con cambios pendientes manda lo local, y se reintenta la subida.
        if (shopping !== null) { setShoppingItemsRaw(shopping); guardarLocal(CLAVE_LISTA, shopping); }
        if (tracker !== null) { setTrackerItemsRaw(tracker); guardarLocal(CLAVE_CARRITO, tracker); }
        if (purchases !== null) { setSavedPurchasesRaw(purchases); guardarLocal(CLAVE_COMPRAS, purchases); }
        setSyncState('ok');
      } catch {
        if (!cancelado) setSyncState('error');
      }
      if (!cancelado) subirPendientes();
    })();
    return () => { cancelado = true; };
  }, [user?.id, subirPendientes]);

  /**
   * Guarda un cambio: primero en el navegador, después en la nube.
   *
   * El guardado local y la subida quedan FUERA del actualizador de estado. Ahí
   * dentro no pueden ir efectos secundarios: React puede ejecutar esa función
   * más de una vez por render, lo que provocaba subidas duplicadas.
   *
   * Si la subida falla —sin señal, servidor caído— el cambio queda marcado como
   * pendiente y se reintenta al volver la conexión. Lo local nunca se pierde.
   */
  const guardar = useCallback(<T,>(
    clave: string,
    valor: T[],
    aplicar: (v: T[]) => void,
    subir: (v: T[]) => Promise<void>,
  ) => {
    aplicar(valor);
    guardarLocal(clave, valor);
    marcarPendiente(clave);
    setSyncState('loading');
    subir(valor)
      .then(() => { limpiarPendiente(clave); setSyncState('ok'); })
      .catch(err => { console.error('sync', clave, err); setSyncState('error'); });
  }, []);

  const setShoppingItems = useCallback((val: ShoppingItem[] | ((prev: ShoppingItem[]) => ShoppingItem[])) => {
    setShoppingItemsRaw(prev => {
      const next = val instanceof Function ? val(prev) : val;
      // El estado ya se actualiza aquí; el guardado y la subida van en cola
      // aparte para no repetirse si React reejecuta este actualizador.
      queueMicrotask(() => guardar(CLAVE_LISTA, next, () => {}, pushShoppingItems));
      return next;
    });
  }, [guardar]);

  const setTrackerItems = useCallback((val: TrackerItem[] | ((prev: TrackerItem[]) => TrackerItem[])) => {
    setTrackerItemsRaw(prev => {
      const next = val instanceof Function ? val(prev) : val;
      queueMicrotask(() => guardar(CLAVE_CARRITO, next, () => {}, pushTrackerItems));
      return next;
    });
  }, [guardar]);

  const setSavedPurchases = useCallback((val: SavedPurchase[] | ((prev: SavedPurchase[]) => SavedPurchase[])) => {
    setSavedPurchasesRaw(prev => {
      const next = val instanceof Function ? val(prev) : val;
      queueMicrotask(() => guardar(CLAVE_COMPRAS, next, () => {}, pushSavedPurchases));
      return next;
    });
  }, [guardar]);

  // Al recuperar la señal se reintenta lo pendiente, sin tocar lo que hay en
  // pantalla: recargar desde la nube en este momento borraría los cambios que
  // el usuario hizo justamente mientras estaba sin conexión.
  useEffect(() => {
    const alVolver = () => { subirPendientes(); };
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [subirPendientes]);

  // Lista → Carrito: agrega al final de lo que ya haya y vacía la lista.
  // Los productos sin precio registrado entran en 0 para que el usuario los
  // complete; nunca se estima un precio.
  const migrateListToCart = useCallback((list: ShoppingItem[], preciosPorItem: Map<string, number>) => {
    if (list.length === 0) return;
    const migrated: TrackerItem[] = list.map(item => {
      // La Lista ya resolvió el precio, sea de los aportes o del catálogo.
      const unitPrice = preciosPorItem.get(item.id) ?? 0;
      return {
        id: crypto.randomUUID(),
        name: item.name,
        quantity: item.quantity ?? 1,
        unitPrice,
        unit: item.unit ?? 'Und',
        category: item.category,
        barcode: item.barcode,
      };
    });
    setTrackerItems(prev => [...prev, ...migrated]);
    setShoppingItems([]);
    setActiveTab('cart');
  }, [setTrackerItems, setShoppingItems]);

  const logout = async () => {
    await supabase.auth.signOut();
    for (const clave of [CLAVE_LISTA, CLAVE_CARRITO, CLAVE_COMPRAS]) {
      localStorage.removeItem(clave);
      limpiarPendiente(clave);
    }
    usuarioCargado.current = null;
    setShoppingItemsRaw([]);
    setTrackerItemsRaw([]);
    setSavedPurchasesRaw([]);
  };

  // Still checking auth
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center h-dvh bg-brand-lime-soft">
        <Loader size={32} className="animate-spin text-green-700" />
      </div>
    );
  }

  // Not logged in
  if (user === null) {
    return <AuthScreen />;
  }

  const syncIcon = syncState === 'loading'
    ? <Loader size={13} className="animate-spin text-green-300" />
    : syncState === 'ok'
      ? <Cloud size={13} className="text-green-300" />
      : <CloudOff size={13} className="text-red-400" />;

  return (
    <div className="flex flex-col h-dvh bg-brand-lime max-w-lg mx-auto relative">
      {/* Top header: tarjeta flotante, separada de los bordes de la pantalla,
          igual que la barra de navegación inferior. */}
      <header className="bg-brand-dark flex-shrink-0 mx-3 mt-3 px-5 py-4 flex items-center gap-4 shadow-lg rounded-3xl">
        <div className="bg-white rounded-2xl p-2 shadow-md flex-shrink-0">
          <img src="/logo.png" alt="MarktPlan" className="h-16 w-16 object-contain" />
        </div>
        <div className="flex-1">
          <h1 className="text-white font-extrabold text-2xl leading-tight tracking-tight">MarktPlan</h1>
          <p className="text-green-300 text-xs font-medium leading-tight truncate max-w-[140px]">{user.email}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-col items-center gap-0.5">
            {syncIcon}
            <span className="text-[9px] text-green-400">
              {syncState === 'loading' ? 'Sync...' : syncState === 'ok' ? 'Nube' : 'Error'}
            </span>
          </div>
          <button onClick={logout} className="text-green-400 hover:text-white transition-colors mt-1" title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Content: min-h-0 es necesario para que el hijo con scroll interno de
          cada pantalla (Lista, Carrito, etc.) realmente recorte en vez de
          crecer más allá de este espacio — sin esto, termina desplazándose
          la página entera (encabezado y nav incluidos) en vez de solo la
          lista de productos. */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'list' && (
          <ShoppingList
            items={shoppingItems}
            setItems={setShoppingItems}
            onMigrateToCart={migrateListToCart}
          />
        )}
        {activeTab === 'cart' && (
          <CostTracker
            trackerItems={trackerItems}
            setTrackerItems={setTrackerItems}
            savedPurchases={savedPurchases}
            setSavedPurchases={setSavedPurchases}
          />
        )}
        {activeTab === 'reports' && <Reports savedPurchases={savedPurchases} />}
        {activeTab === 'compare' && <Comparativa />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-brand-dark flex-shrink-0 mx-3 mb-3 mt-1 px-2 py-1.5 rounded-3xl shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex">
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-all"
              >
                <div className={`flex items-center justify-center w-11 h-9 rounded-full transition-all ${active ? 'bg-brand-lime' : ''}`}>
                  <Icon size={18} className={active ? 'text-brand-dark' : 'text-green-300'} />
                </div>
                <span className={`text-[10px] font-bold transition-colors ${active ? 'text-brand-lime' : 'text-green-400'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
