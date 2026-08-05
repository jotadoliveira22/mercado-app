#!/usr/bin/env node
/**
 * Orquestador semanal: corre los scrapers, junta sus filas y publica en
 * Supabase con la misma lógica que usa import-catalog.mjs para el .xlsx
 * manual (catalog-sync.mjs), así que el resultado se comporta igual: solo
 * upsert, nunca borra lo que no vino en esta corrida.
 *
 * Uso:
 *   npm run scrape                 (publica en Supabase)
 *   npm run scrape -- --dry-run    (solo muestra el resumen)
 *
 * Requiere en el entorno (.env local, o secreto de GitHub Actions):
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Si un scraper individual falla (la tienda cambió su web, verificación
 * anti-bot, etc.), el resto sigue: es preferible publicar 3 cadenas
 * actualizadas que fallar por completo por una sola caída.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformar, publicarEnSupabase } from './lib/catalog-sync.mjs';
import { scrape as scrapeCentralMadeirense } from './scrapers/central-madeirense.mjs';
import { scrape as scrapeGama } from './scrapers/gama.mjs';
import { scrape as scrapeAutomercadosPlaza } from './scrapers/automercados-plaza.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCRAPERS = [
  { nombre: 'Central Madeirense', run: scrapeCentralMadeirense },
  { nombre: 'Gama', run: scrapeGama },
  { nombre: 'Automercados Plaza', run: scrapeAutomercadosPlaza },
];

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');

  console.log('🕷️  Scraper semanal de precios\n');

  const filas = [];
  const resumen = [];

  for (const { nombre, run } of SCRAPERS) {
    console.log(`▶ ${nombre}`);
    try {
      const filasScraper = await run((msg) => console.log(msg));
      filas.push(...filasScraper);
      resumen.push({ nombre, productos: filasScraper.length, error: null });
      console.log(`  ✅ ${filasScraper.length} filas\n`);
    } catch (error) {
      resumen.push({ nombre, productos: 0, error: error.message });
      console.log(`  ❌ falló: ${error.message}\n`);
    }
  }

  if (filas.length === 0) {
    console.error('❌ Ningún scraper devolvió datos. No se publica nada.');
    process.exit(1);
  }

  const { retailers, branches, products, precios } = transformar(filas);

  console.log('── Resumen ──────────────────────────────');
  for (const r of resumen) {
    const estado = r.error ? `❌ ${r.error}` : `✅ ${r.productos} filas`;
    console.log(`  ${r.nombre.padEnd(22)} ${estado}`);
  }
  console.log(`\n  Productos únicos : ${products.length}`);
  console.log(`  Precios          : ${precios.length}`);

  // Respaldo local del CSV, por si hace falta auditar qué se publicó en esta
  // corrida. Se guarda fuera del repo (backups/ está en .gitignore).
  const backupsDir = join(ROOT, 'backups');
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupPath = join(backupsDir, `scrape_${timestamp}.json`);
  writeFileSync(backupPath, JSON.stringify({ retailers, branches, products, precios }, null, 2), 'utf8');
  console.log(`\n💾 Respaldo local: ${backupPath}`);

  if (dryRun) {
    console.log('\n🔍 --dry-run: no se escribió nada en Supabase.');
    return;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('\n❌ Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exit(1);
  }

  console.log('\n📤 Publicando en Supabase...');
  const resultado = await publicarEnSupabase({ retailers, branches, products, precios }, key);
  console.log(`\n🎉 Publicación completa: ${resultado.productos} productos, ${resultado.precios} precios.`);

  // Si alguna cadena falló por completo, la corrida se marca como fallida
  // igual (útil para que el cron avise), aunque las demás sí se publicaran.
  if (resumen.some(r => r.error)) {
    console.error('\n⚠️  Una o más cadenas fallaron esta semana. Revisa el resumen arriba.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
