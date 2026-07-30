/**
 * Lector mínimo de .xlsx, sin dependencias.
 *
 * Un .xlsx es un ZIP con XML dentro, y Node ya trae zlib, así que no hace falta
 * una librería. Se escribió a mano porque hoy ninguna librería de xlsx en npm
 * está libre de vulnerabilidades: `xlsx` (SheetJS) tiene una alta sin parche
 * publicado en npm, y `exceljs` arrastra archiver → glob → brace-expansion,
 * también alta. Igual que el script de backup, esto mantiene el proyecto en
 * cero vulnerabilidades.
 *
 * Cubre lo que necesita la importación del catálogo: hojas, filas y celdas de
 * texto, número y fecha. NO cubre fórmulas calculadas, estilos ni gráficos.
 */

import { inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

// ── ZIP ──────────────────────────────────────────────────────────────────────

/** Devuelve un Map<nombreArchivo, Buffer> con el contenido del ZIP. */
function leerZip(buf) {
  // El End of Central Directory está al final, pero puede haber un comentario
  // después, así que se busca la firma hacia atrás.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no es un .xlsx válido (falta el fin del ZIP)');

  const nEntradas = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16); // inicio del directorio central

  const archivos = new Map();
  for (let i = 0; i < nEntradas; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(off + 10);
    const tamComprimido = buf.readUInt32LE(off + 20);
    const lenNombre = buf.readUInt16LE(off + 28);
    const lenExtra = buf.readUInt16LE(off + 30);
    const lenComentario = buf.readUInt16LE(off + 32);
    const offLocal = buf.readUInt32LE(off + 42);
    const nombre = buf.toString('utf8', off + 46, off + 46 + lenNombre);

    // El tamaño real del nombre/extra puede diferir en la cabecera local.
    const lnNombre = buf.readUInt16LE(offLocal + 26);
    const lnExtra = buf.readUInt16LE(offLocal + 28);
    const inicio = offLocal + 30 + lnNombre + lnExtra;
    const datos = buf.subarray(inicio, inicio + tamComprimido);

    if (metodo === 0) archivos.set(nombre, datos);
    else if (metodo === 8) archivos.set(nombre, inflateRawSync(datos));
    // otros métodos (bzip2, lzma) no los usa Excel para xlsx

    off += 46 + lenNombre + lenExtra + lenComentario;
  }
  return archivos;
}

// ── XML ──────────────────────────────────────────────────────────────────────

/**
 * Prefijo de espacio de nombres opcional. Los generadores no coinciden: unos
 * escriben `<sheet>` y otros `<x:sheet>`. El archivo del catálogo usa `x:`, así
 * que todos los patrones deben tolerar ambas formas.
 */
const NS = '(?:[A-Za-z_][\\w.-]*:)?';

function desescapar(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // al final, para no re-desescapar
}

/** Texto de un <si> de sharedStrings: puede venir partido en varios <t>. */
function textoDeSi(xml) {
  let out = '';
  const re = new RegExp(`<${NS}t(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}t>`, 'g');
  let m;
  while ((m = re.exec(xml))) out += m[1];
  return desescapar(out);
}

function leerSharedStrings(archivos) {
  const buf = archivos.get('xl/sharedStrings.xml');
  if (!buf) return [];
  const xml = buf.toString('utf8');
  const out = [];
  const re = new RegExp(`<${NS}si(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}si>|<${NS}si\\s*/>`, 'g');
  let m;
  while ((m = re.exec(xml))) out.push(m[1] ? textoDeSi(m[1]) : '');
  return out;
}

/** 'A' → 0, 'Z' → 25, 'AA' → 26 */
function colIndice(ref) {
  const letras = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Serial de fecha de Excel → Date. Excel cuenta desde 1899-12-30. */
function fechaExcel(serial) {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/**
 * Formatos numéricos que representan fechas. Se detectan por numFmtId para
 * poder distinguir un precio de una fecha de extracción.
 */
const FMT_FECHA_INTEGRADOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function leerFormatosFecha(archivos) {
  const buf = archivos.get('xl/styles.xml');
  if (!buf) return new Set();
  const xml = buf.toString('utf8');

  // numFmt personalizados que contienen marcas de fecha/hora
  const personalizados = new Set();
  const reFmt = new RegExp(`<${NS}numFmt[^>]*numFmtId="(\\d+)"[^>]*formatCode="([^"]*)"`, 'g');
  let m;
  while ((m = reFmt.exec(xml))) {
    const code = desescapar(m[2]);
    if (/[dmyhs]/i.test(code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''))) {
      personalizados.add(Number(m[1]));
    }
  }

  // cellXfs: el índice de estilo (s="N") apunta aquí
  const cellXfs = xml.match(new RegExp(`<${NS}cellXfs[\\s\\S]*?</${NS}cellXfs>`))?.[0] ?? '';
  const esFecha = new Set();
  const reXf = new RegExp(`<${NS}xf[^>]*numFmtId="(\\d+)"[^>]*/?>`, 'g');
  let i = 0;
  while ((m = reXf.exec(cellXfs))) {
    const id = Number(m[1]);
    if (FMT_FECHA_INTEGRADOS.has(id) || personalizados.has(id)) esFecha.add(i);
    i++;
  }
  return esFecha;
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Lee un .xlsx y devuelve { nombreHoja: string[][] } con los valores en crudo.
 * Las celdas vacías quedan como null y las filas conservan su posición de
 * columna, así que una columna intermedia vacía no desplaza las demás.
 */
export function leerLibro(ruta) {
  const archivos = leerZip(readFileSync(ruta));
  const compartidas = leerSharedStrings(archivos);
  const estilosFecha = leerFormatosFecha(archivos);

  // workbook.xml da los nombres y su r:id; los rels mapean r:id → archivo
  const wbXml = archivos.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const relsXml = archivos.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';

  // Los atributos no vienen en un orden fijo: este archivo escribe
  // Type, Target, Id — mientras otros generadores ponen Id primero. Por eso se
  // captura la etiqueta completa y luego se extrae cada atributo por separado.
  const atributo = (tag, nombre) =>
    tag.match(new RegExp(`(?:^|\\s)${NS}${nombre}="([^"]*)"`, 'i'))?.[1];

  const rels = new Map();
  for (const tag of relsXml.match(new RegExp(`<${NS}Relationship\\b[^>]*>`, 'g')) ?? []) {
    const id = atributo(tag, 'Id');
    const target = atributo(tag, 'Target');
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const hojas = [];
  for (const tag of wbXml.match(new RegExp(`<${NS}sheet\\b[^>]*>`, 'g')) ?? []) {
    const nombre = atributo(tag, 'name');
    // El r:id puede llevar cualquier prefijo de namespace, no solo "r:".
    const rid = tag.match(new RegExp(`\\s[A-Za-z_][\\w.-]*:id="([^"]+)"`))?.[1];
    if (nombre && rid) hojas.push({ nombre: desescapar(nombre), rid });
  }

  const libro = {};
  for (const { nombre, rid } of hojas) {
    const destino = rels.get(rid);
    const buf = destino
      ? archivos.get(`xl/${destino}`) ?? archivos.get(destino)
      : undefined;
    libro[nombre] = buf ? leerHoja(buf.toString('utf8'), compartidas, estilosFecha) : [];
  }
  return libro;
}

function leerHoja(xml, compartidas, estilosFecha) {
  const reValor = new RegExp(`<${NS}v(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}v>`);
  const filas = [];
  const reFila = new RegExp(`<${NS}row\\b[^>]*>([\\s\\S]*?)</${NS}row>|<${NS}row\\b[^>]*/>`, 'g');
  let mf;
  while ((mf = reFila.exec(xml))) {
    const contenido = mf[1] ?? '';
    const celdas = [];
    const reCelda = new RegExp(`<${NS}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${NS}c>)`, 'g');
    let mc;
    while ((mc = reCelda.exec(contenido))) {
      const attrs = mc[1] ?? '';
      const cuerpo = mc[2] ?? '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const idx = ref ? colIndice(ref) : celdas.length;
      const tipo = attrs.match(/\bt="([^"]+)"/)?.[1] ?? 'n';
      const estilo = attrs.match(/\bs="(\d+)"/)?.[1];

      let valor = null;
      if (tipo === 's') {
        const i = Number(cuerpo.match(reValor)?.[1]);
        valor = compartidas[i] ?? null;
      } else if (tipo === 'inlineStr') {
        valor = textoDeSi(cuerpo);
      } else if (tipo === 'str') {
        valor = desescapar(cuerpo.match(reValor)?.[1] ?? '');
      } else if (tipo === 'b') {
        valor = cuerpo.match(reValor)?.[1] === '1';
      } else {
        const raw = cuerpo.match(reValor)?.[1];
        if (raw !== undefined && raw !== '') {
          const n = Number(raw);
          valor = Number.isFinite(n)
            ? (estilo !== undefined && estilosFecha.has(Number(estilo)) ? fechaExcel(n) : n)
            : raw;
        }
      }
      while (celdas.length < idx) celdas.push(null);
      celdas[idx] = valor === '' ? null : valor;
    }
    filas.push(celdas);
  }
  return filas;
}

/**
 * Convierte filas en objetos usando una fila como cabecera.
 * `desde` es el índice (base 0) de la fila de cabecera.
 */
export function filasAObjetos(filas, desde = 0) {
  const cabecera = (filas[desde] ?? []).map(c => (c == null ? '' : String(c).trim()));
  const out = [];
  for (let i = desde + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila.every(c => c == null)) continue;
    const obj = {};
    for (let j = 0; j < cabecera.length; j++) {
      if (cabecera[j]) obj[cabecera[j]] = fila[j] ?? null;
    }
    out.push(obj);
  }
  return out;
}
