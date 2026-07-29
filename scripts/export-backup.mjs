#!/usr/bin/env node
/**
 * Exporta las tablas de Supabase a CSV + JSON en la carpeta backups/.
 *
 * Uso:
 *   npm run backup
 *
 * Requiere un archivo .env en la raíz del proyecto con:
 *   BACKUP_EMAIL=tu-correo@ejemplo.com
 *   BACKUP_PASSWORD=tu-contrasena
 *
 * Opcionalmente, para exportar TODOS los usuarios (no solo el tuyo):
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Sin dependencias: usa la API REST de Supabase y el fetch nativo de Node 18+.
 * Esto es a propósito — el backup debe funcionar aunque node_modules esté roto.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaHZ3cmF1a3FhZWJld3l0bWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDkxMDksImV4cCI6MjA5NzM4NTEwOX0.kEYjPlnlOoNy70GmRaJic7-FhMxuCb3jFidx1aKebhU';

// Tablas a exportar. `scoped` = tiene columna user_id (filtra por el usuario logueado).
const TABLES = [
  { name: 'shopping_items', scoped: true, orderBy: 'created_at' },
  { name: 'tracker_items', scoped: true, orderBy: null },
  { name: 'saved_purchases', scoped: true, orderBy: 'date' },
  { name: 'store_prices', scoped: false, orderBy: 'product_name' },
];

const PAGE_SIZE = 1000; // Supabase limita a 1000 filas por request

// ── .env ────────────────────────────────────────────────────────────────────

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function toCsvValue(v) {
  if (v === null || v === undefined) return '';
  // Objetos y arrays (columnas JSONB como saved_purchases.items) van serializados.
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  // Unimos las claves de todas las filas: una fila puede traer null donde otra trae dato.
  const headers = [...new Set(rows.flatMap(Object.keys))];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => toCsvValue(row[h])).join(','));
  }
  // BOM para que Excel abra los acentos correctamente.
  return '﻿' + lines.join('\n') + '\n';
}

// ── Supabase REST ───────────────────────────────────────────────────────────

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  // No asumimos JSON: un proxy o una caída devuelven HTML y romperían res.json().
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`respuesta inesperada (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(body.error_description || body.msg || body.error || res.statusText);
  }
  if (!body.access_token || !body.user?.id) {
    throw new Error('la respuesta no incluyó sesión válida');
  }
  return { token: body.access_token, userId: body.user.id };
}

async function fetchAll(table, { key, token, userId }) {
  const rows = [];
  for (let page = 0; ; page++) {
    const params = new URLSearchParams({ select: '*' });
    if (table.scoped && userId) params.set('user_id', `eq.${userId}`);
    if (table.orderBy) params.set('order', `${table.orderBy}.asc`);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table.name}?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${raw.slice(0, 200)}`);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`respuesta no-JSON: ${raw.slice(0, 120)}`);
    }
    if (!Array.isArray(data)) throw new Error(`respuesta inesperada: ${raw.slice(0, 120)}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.BACKUP_EMAIL;
  const password = process.env.BACKUP_PASSWORD;

  let auth, scope;

  if (serviceKey) {
    // El service role salta RLS: se usa como apikey y como bearer a la vez.
    auth = { key: serviceKey, token: serviceKey, userId: null };
    scope = 'todos los usuarios (service role)';
    console.log('🔑 Usando service role key — exportando todos los usuarios.');
  } else {
    if (!email || !password) {
      console.error(
        '❌ Faltan credenciales.\n\n' +
          '   Copia .env.example a .env y rellena:\n' +
          '     BACKUP_EMAIL=tu-correo@ejemplo.com\n' +
          '     BACKUP_PASSWORD=tu-contrasena\n'
      );
      process.exit(1);
    }
    let session;
    try {
      session = await signIn(email, password);
    } catch (err) {
      console.error(`❌ No se pudo iniciar sesión: ${err.message}`);
      process.exit(1);
    }
    auth = { key: SUPABASE_ANON_KEY, token: session.token, userId: session.userId };
    scope = `usuario ${email}`;
    console.log(`🔓 Sesión iniciada como ${email}`);
  }

  const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const outDir = join(ROOT, 'backups', stamp);
  mkdirSync(outDir, { recursive: true });

  console.log(`\n📦 Exportando a backups/${stamp}/\n`);

  const summary = {};
  let failed = 0;

  for (const table of TABLES) {
    try {
      const rows = await fetchAll(table, auth);
      writeFileSync(join(outDir, `${table.name}.csv`), toCsv(rows), 'utf8');
      writeFileSync(
        join(outDir, `${table.name}.json`),
        JSON.stringify(rows, null, 2),
        'utf8'
      );
      summary[table.name] = rows.length;
      console.log(`   ✅ ${table.name.padEnd(18)} ${rows.length} filas`);
    } catch (err) {
      summary[table.name] = { error: err.message };
      failed++;
      console.log(`   ❌ ${table.name.padEnd(18)} ${err.message}`);
    }
  }

  writeFileSync(
    join(outDir, 'metadata.json'),
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        scope,
        user_id: auth.userId,
        tables: summary,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    failed === 0
      ? `\n🎉 Backup completo en backups/${stamp}/`
      : `\n⚠️  Backup terminado con ${failed} tabla(s) con error.`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
