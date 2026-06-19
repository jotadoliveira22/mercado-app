import { useState, useEffect, useCallback } from 'react';
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
import type { User } from '@supabase/supabase-js';

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

  const [shoppingItems, setShoppingItemsRaw] = useState<ShoppingItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('shopping-items') || '[]'); } catch { return []; }
  });
  const [trackerItems, setTrackerItemsRaw] = useState<TrackerItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('tracker-items') || '[]'); } catch { return []; }
  });
  const [savedPurchases, setSavedPurchasesRaw] = useState<SavedPurchase[]>(() => {
    try { return JSON.parse(localStorage.getItem('saved-purchases') || '[]'); } catch { return []; }
  });

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

  // Load from Supabase when user logs in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadFromCloud() {
      setSyncState('loading');
      try {
        const [shopping, tracker, purchases] = await Promise.all([
          fetchShoppingItems(),
          fetchTrackerItems(),
          fetchSavedPurchases(),
        ]);
        if (cancelled) return;
        if (shopping !== null) {
          setShoppingItemsRaw(shopping);
          localStorage.setItem('shopping-items', JSON.stringify(shopping));
        }
        if (tracker !== null) {
          setTrackerItemsRaw(tracker);
          localStorage.setItem('tracker-items', JSON.stringify(tracker));
        }
        if (purchases !== null) {
          setSavedPurchasesRaw(purchases);
          localStorage.setItem('saved-purchases', JSON.stringify(purchases));
        }
        setSyncState('ok');
      } catch {
        if (!cancelled) setSyncState('error');
      }
    }
    loadFromCloud();
    return () => { cancelled = true; };
  }, [user]);

  const setShoppingItems = useCallback((val: ShoppingItem[] | ((prev: ShoppingItem[]) => ShoppingItem[])) => {
    setShoppingItemsRaw(prev => {
      const next = val instanceof Function ? val(prev) : val;
      localStorage.setItem('shopping-items', JSON.stringify(next));
      pushShoppingItems(next).catch(() => {});
      return next;
    });
  }, []);

  const setTrackerItems = useCallback((val: TrackerItem[] | ((prev: TrackerItem[]) => TrackerItem[])) => {
    setTrackerItemsRaw(prev => {
      const next = val instanceof Function ? val(prev) : val;
      localStorage.setItem('tracker-items', JSON.stringify(next));
      pushTrackerItems(next).catch(() => {});
      return next;
    });
  }, []);

  const setSavedPurchases = useCallback((val: SavedPurchase[] | ((prev: SavedPurchase[]) => SavedPurchase[])) => {
    setSavedPurchasesRaw(prev => {
      const next = val instanceof Function ? val(prev) : val;
      localStorage.setItem('saved-purchases', JSON.stringify(next));
      pushSavedPurchases(next).catch(() => {});
      return next;
    });
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('shopping-items');
    localStorage.removeItem('tracker-items');
    localStorage.removeItem('saved-purchases');
    setShoppingItemsRaw([]);
    setTrackerItemsRaw([]);
    setSavedPurchasesRaw([]);
  };

  // Still checking auth
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f0fdf4]">
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
    <div className="flex flex-col h-screen bg-[#f0fdf4] max-w-lg mx-auto relative">
      {/* Top header */}
      <header className="bg-[#166534] flex-shrink-0 px-5 py-4 flex items-center gap-4 shadow-lg">
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'list' && <ShoppingList items={shoppingItems} setItems={setShoppingItems} />}
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
      <nav className="bg-[#166534] flex-shrink-0 px-2 py-1 shadow-[0_-2px_16px_rgba(0,0,0,0.2)]">
        <div className="flex">
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-all"
              >
                <div className={`flex items-center justify-center w-11 h-7 rounded-xl transition-all ${active ? 'bg-white' : ''}`}>
                  <Icon size={18} className={active ? 'text-[#166534]' : 'text-green-300'} />
                </div>
                <span className={`text-[10px] font-bold transition-colors ${active ? 'text-white' : 'text-green-400'}`}>
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
