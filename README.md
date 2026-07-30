# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Backup de datos (Supabase → CSV)

Exporta las tablas de Supabase a CSV y JSON en `backups/<fecha>/`:

```bash
cp .env.example .env    # y rellena tus credenciales
npm run backup
```

Tablas exportadas: `shopping_items`, `tracker_items`, `saved_purchases`, `store_prices`.

Por defecto exporta solo **tus** datos (inicia sesión con tu correo y respeta las
políticas RLS). Para exportar los de todos los usuarios, define
`SUPABASE_SERVICE_ROLE_KEY` en el `.env`.

El script no tiene dependencias — usa la API REST de Supabase y el `fetch` nativo
de Node 18+, así que funciona aunque `node_modules` no esté instalado.

La carpeta `backups/` y el archivo `.env` están en `.gitignore`.

## Seguridad de la base de datos (RLS)

Las políticas de Row Level Security están en `db/rls_policies.sql`. Para
aplicarlas: Supabase → SQL Editor → New query → pegar el archivo → Run.
Es idempotente, se puede correr varias veces.

- `shopping_items`, `tracker_items`, `saved_purchases`: privadas por usuario.
- `store_prices`: comparativa compartida. Los usuarios autenticados leen y
  aportan precios; los anónimos no tienen acceso. Cada precio guarda quién lo
  aportó en `contributed_by`.

Al final del archivo hay una consulta de verificación para confirmar que RLS
quedó activo en las cuatro tablas.

## Catálogo de precios de supermercados

Importa un archivo de catálogo (`Base_precios_supermercados_vN.xlsx`) a las
tablas `catalog_*`:

```bash
# 1. Aplicar el esquema en Supabase → SQL Editor
#    db/catalog_schema.sql
# 2. Poner SUPABASE_SERVICE_ROLE_KEY en .env (el catálogo es de solo lectura
#    para los usuarios, así que la importación necesita esa clave)
npm run import:catalog -- archivo.xlsx --dry-run   # ver qué haría
npm run import:catalog -- archivo.xlsx             # importar
```

El catálogo se mantiene **separado** de `store_prices`: `catalog_*` son datos
extraídos de los sitios de los supermercados y se reemplazan en cada corrida,
mientras `store_prices` guarda lo que aportan los usuarios y nunca debe ser
sobrescrito por una importación.

Notas sobre los datos:

- Los **SKU no son códigos de barras**: son códigos internos de cada cadena
  (9-10 dígitos). El campo `barcode` queda vacío y se llenará con el tiempo.
- La **moneda** se normaliza a USD. La fuente etiqueta parte de las filas como
  `BSD`, pero los valores están en la misma escala que las marcadas `USD`
  (verificado: el mismo producto vale 1.35 en ambas). `moneda_fuente` conserva
  lo que dijo el sitio para poder auditarlo.
- Se **omiten** las filas `PARCIAL`, cuyo nombre es "PRODUCTO SIN NOMBRE
  PUBLICADO" y no sirven para comparar ni buscar.
- La **categoría** se recalcula con `categorizeProduct()` para usar las mismas
  22 categorías de la app; si devuelve 'Otros', se cae a la categoría del
  archivo cuando la equivalencia es inequívoca.

El lector de `.xlsx` (`scripts/lib/xlsx-reader.mjs`) está escrito a mano y sin
dependencias: hoy ninguna librería de xlsx en npm está libre de
vulnerabilidades (`xlsx` tiene una alta sin parche, `exceljs` arrastra
`brace-expansion`). Está validado contra el archivo real: 11.743 filas,
9.357 utilizables, conteos por sucursal y valores puntuales.
