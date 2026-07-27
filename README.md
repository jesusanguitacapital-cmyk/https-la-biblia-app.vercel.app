# La Biblia App

Aplicacion web personal para llevar un journal de trading, controlar estrategias, cuentas de fondeo, operaciones, retiros, calendarios y analisis visuales.

## Estado actual

- Frontend: React + Vite + TypeScript.
- Persistencia actual en navegador: `localStorage`.
- Build de produccion: `npm run build`.
- Carpeta de salida para publicar: `dist`.

## Desarrollo local

```bash
npm install
npm run dev:vite
```

Abre la app en:

```text
http://127.0.0.1:5173/
```

## Publicar en Vercel

Configuracion recomendada:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## Nota importante sobre datos

Ahora mismo los datos se guardan en el navegador mediante `localStorage`. Al publicar la web, podras abrir la app desde cualquier ordenador, pero cada navegador tendra sus propios datos.

Para sincronizar datos entre ordenadores hay que conectar una base de datos online, por ejemplo Supabase o Firebase, y migrar el guardado desde `localStorage` a usuario + base de datos.
