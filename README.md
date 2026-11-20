# Recetas

Biblioteca personal de recetas (Next.js + SQLite + IA).

## Estructura

```
Recetas/
  data/
    recetas.db       # base SQLite (local y producción; no versionar)
    imports/         # CSVs u otros insumos de importación
    logs/            # logs de batch (gitignored)
  scripts/
    deploy-vps-update.py   # deploy manual al VPS (local, con credenciales)
  web/               # app Next.js
  docker-compose.yml # producción en VPS
```

## Desarrollo local

```bash
cd web
cp .env.example .env.local   # completar OPENROUTER_API_KEY + Google OAuth
npm install
npm run db:migrate
npm run dev
```

Abrir http://localhost:3000 — la app exige login con Google.

### Auth (Google)

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) creá un OAuth Client ID (tipo “Web application”).
2. Authorized redirect URIs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Producción: `https://katiagadea.com.ar/recetas/api/auth/callback/google`
3. En `.env.local` (y en el `.env` del VPS) completá:
   - `AUTH_SECRET`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
   - `AUTH_URL`: local `http://localhost:3000`; producción `https://katiagadea.com.ar/recetas/api/auth`
   - `AUTH_TRUST_HOST=true` (necesario detrás de nginx/Docker)
   - `AUTH_ALLOWED_EMAILS` (recomendado: tu Gmail, separados por coma si hay más)

La base vive en `data/recetas.db` (misma convención que producción).

## Scripts útiles

Desde `web/`:

| Comando | Qué hace |
|---------|----------|
| `npm run import:csv -- ../../data/imports/archivo.csv "pestaña"` | Importa CSV del Sheet |
| `npm run structure:all` | Estructura pendientes (`importado` / `error_ia`) |
| `npm run structure:redo` | Rehace **todas** las estructurables + pendientes (nuevo modelo) |
| `npm run refine:cfe` | Refina tablas CFE |
| `npm run db:count` | Cuenta recetas por estado |
| `npm run test:openrouter` | Prueba conexión a OpenRouter |

Scripts puntuales viejos están en `web/scripts/archive/`.

## Deploy

Producción: https://katiagadea.com.ar/recetas

El contenedor escucha solo en `127.0.0.1:3043`; nginx del VPS proxea `/recetas` (igual que `/plantas`). No usa los puertos públicos 80/443 directamente.

```bash
python scripts/deploy-vps-update.py
```

Sube `web/` + `data/recetas.db` y rebuilda Docker en el VPS.
