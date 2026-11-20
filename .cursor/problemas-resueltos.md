# Problemas resueltos

Registro vivo de incidentes y soluciones de **este proyecto**.
**Orden:** lo más reciente arriba. El agente debe consultar este archivo antes de depurar.

---

## 2026-11-19 — CFE con streams mal ordenados / filas no contiguas

**Síntoma:** tablas Cooking for Engineers con merges antes de cocinar, salteados aplastados en un solo paso, joins finales solo con limón/perejil, o rowspans rotos (ingredientes del mismo stream intercalados).
**Contexto:** generación IA (`structure-recipe.ts`) + post-proceso (`cfe.ts`).
**Causa:** el prompt no forzaba el modelo mental de streams; `orderActionsForGraph` trataba todo “mezclar” como join final (y a veces adelantaba coats de más); el reorder de filas insertaba ingredientes nuevos al final y partía clusters.
**Solución:** prompt CFE por streams + checklist; coat→cook solo con el mismo set de ids; reorder con inserción pegada al cluster + búsqueda local anti-huecos; `diagnoseCfeIssues` + segundo pase IA si hay errores serios (`completeCfeActionsWithRepair`); `ensureIngredientCoverage` / `ensureFinalJoinCoverage` para garnishes y joins olvidados. Offline: `npm run refine:cfe`. Rebuild masivo: `npm run rebuild:bad-cfe`.
**Prevención:** no “arreglar” CFE solo mirando columnas vacías; correr diagnóstico semántico. Recetas ya guardadas con grafo malo necesitan rebuild IA (`rebuildCfeFromClassic` / `rebuild:bad-cfe`), no solo refine. `collapsed_sequence` es warning (no fuerza rebuild): muchas recetas rehogan varios ítems en un solo paso legítimo.

## 2026-11-19 — prisma.recipeList.findFirst undefined tras migrar listas

**Síntoma:** `Cannot read properties of undefined (reading 'findFirst')` en `ensurePersonalList` / `prisma.recipeList`.
**Contexto:** Next.js Turbopack + Prisma client en `globalThis` (`src/lib/db.ts`).
**Causa:** el singleton de Prisma quedó de antes de la migración; el HMR reusa ese client viejo sin el modelo `RecipeList`.
**Solución:** en `db.ts`, recrear el client si falta `recipeList` o si cambió `PRISMA_SCHEMA_VERSION`. Reiniciar `next dev` si sigue fallando.
**Prevención:** al agregar modelos Prisma, subir `PRISMA_SCHEMA_VERSION` o reiniciar el server de dev.

## 2026-11-19 — Invitados con AUTH_ALLOWED_EMAILS

**Síntoma:** alguien con link de invitación no puede loguearse (AccessDenied) aunque el link sea válido.
**Contexto:** auth Google + allowlist + listas compartidas.
**Causa:** `signIn` solo miraba `AUTH_ALLOWED_EMAILS` y no la invitación pendiente.
**Solución:** al abrir `/invitar/[token]` (vía `GET /api/invitar/[token]`) se setea cookie `recetas_invite`; el callback `signIn` acepta si hay invite activo. Rutas públicas: `/invitar/*` y `/api/invitar/*`.
**Prevención:** no quitar ese bypass al tocar auth; sin cookie previa al OAuth el invitado queda bloqueado.
