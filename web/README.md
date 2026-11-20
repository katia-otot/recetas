# App Recetas (Next.js)

Ver también el [README de la raíz](../README.md).

## Código

- `src/app/` — páginas y rutas API
- `src/components/` — UI
- `src/lib/` — lógica (import, CFE, IA, Prisma)
- `prisma/` — schema y migraciones

## Variables de entorno

Copiar `.env.example` → `.env.local`. La DB por defecto es `../data/recetas.db`.

Auth (Google): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`, opcional `AUTH_ALLOWED_EMAILS`. Ver el README de la raíz.

## Scripts

| Carpeta | Uso |
|---------|-----|
| `scripts/import/` | Importación desde CSV |
| `scripts/ai/` | Estructuración y refinado con IA |
| `scripts/maintenance/` | Utilidades (conteo, test API) |
| `scripts/archive/` | One-offs viejos; no forman parte del flujo habitual |

## Formatos de receta

- **Clásico:** ingredientes + pasos
- **CFE:** tabla tipo Cooking for Engineers (paralelo / dependencias)

La edición puede sincronizar clásico ↔ CFE vía IA.
