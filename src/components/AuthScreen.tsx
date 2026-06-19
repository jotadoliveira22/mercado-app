import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handle = async () => {
    setError('');
    setInfo('');
    if (!email.trim() || !password.trim()) { setError('Completa todos los campos'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    try {
      if (mode === 'register') {
        const { error: e } = await supabase.auth.signUp({ email: email.trim(), password });
        if (e) { setError(e.message); }
        else { setInfo('Revisa tu correo para confirmar tu cuenta, luego inicia sesión.'); setMode('login'); }
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) { setError('Correo o contraseña incorrectos'); }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f0fdf4] max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-[#166534] px-6 pt-12 pb-10 flex flex-col items-center gap-4">
        <div className="bg-white rounded-3xl p-3 shadow-lg">
          <img src="/logo.png" alt="MarktPlan" className="h-20 w-20 object-contain" />
        </div>
        <div className="text-center">
          <h1 className="text-white font-extrabold text-3xl tracking-tight">MarktPlan</h1>
          <p className="text-green-300 text-sm mt-1">Tu asistente de mercado</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pt-8 space-y-4">
        <h2 className="text-gray-800 font-bold text-xl">
          {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
        {info && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">
            {info}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              placeholder="tu@correo.com"
              autoComplete="email"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <button
          onClick={handle}
          disabled={loading}
          className="w-full bg-[#166534] hover:bg-[#14532d] active:bg-[#052e16] text-white font-bold rounded-2xl py-4 text-sm transition-colors shadow-md disabled:opacity-60 mt-2"
        >
          {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>

        <div className="text-center pt-2">
          {mode === 'login' ? (
            <p className="text-sm text-gray-500">
              ¿No tienes cuenta?{' '}
              <button onClick={() => { setMode('register'); setError(''); setInfo(''); }} className="text-green-700 font-semibold">
                Regístrate
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              ¿Ya tienes cuenta?{' '}
              <button onClick={() => { setMode('login'); setError(''); setInfo(''); }} className="text-green-700 font-semibold">
                Inicia sesión
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
