# Problemas resueltos

Registro vivo de incidentes y soluciones de **este proyecto**.
**Orden:** lo más reciente arriba. El agente debe consultar este archivo antes de depurar.

---

## 2026-11-20 — CFE: audit → reglas/guards (durations inventadas + FPs)

**Síntoma:** muchas CFEs con `5-7 min` inventados; audit marcaba falsos positivos (`asar` en amasar, “Mezclar y servir” como coat, bechamel con harina como `cook_with_coating`).
**Contexto:** defensa en capas antes de deploy (prompts OpenRouter + post-proceso + repair IA). Skills de Cursor no corren en prod.
**Causa:** el modelo inventa durations; guards incompletos; heurísticas de audit demasiado agresivas.
**Solución:** `stripInventedDurations(actions, steps)` en `refineCfeActions` / `assembleCfe` / `refineStoredCfe`; `diagnoseCfeIssues(..., { steps })`; `COOK_VERB` con `\basar\b`; `cook_with_coating` solo dorar/freír; audit ignora joins finales en `cook_left_of_mix`. Reglas en `cfe-ai-rules.ts` (`CFE_KNOWN_FAILURES`). Offline: `npm run refine:cfe` luego `npx tsx scripts/ai/audit-cfe-now.ts`; serios: `npm run rebuild:bad-cfe -- --slugs=... --force`.
**Prevención:** al agregar un fallo CFE nuevo, meterlo en `CFE_KNOWN_FAILURES` + guard determinista (no solo el skill). Pasar siempre `steps` al refine/diagnose.

## 2026-11-20 — CFE Fideos agridulces: tofu dorado antes de mezclar / wok sin acumular

**Síntoma:** tabla CFE con “Dorar tofu” antes de “Mezclar tofu+maicena”; al agregar aromáticos/salsa al wok no incluía la cebolla ya salteada; la soja compartida partía filas de la salsa.
**Contexto:** receta `fideos-chinos-agridulces`; post-proceso + prompt CFE.
**Causa:** `isLargeJoin` trataba coats chicos (tofu+2) como join; coat→cook exigía mismo set exacto; no se acumulaban ids del sartén vía `dependsOn`; el reorder insertaba el stream de tofu en medio del de salsa por overlap de soja.
**Solución:** coat-for-cook con subset + sin otro stream de cocción; acumular ids en Agregar/Añadir; dedupe de condimentos compartidos; reorder sin partir bloques si overlap &lt; 50%; `stripCoatingsFromCooks` (Dorar solo tofu, no maicena); forzar columna coat &lt; cook; prompt con ejemplo fideos/wok. Rebuild: `npm run rebuild:bad-cfe -- --slug=fideos-chinos-agridulces --force`.
**Prevención:** al tocar `orderActionsForGraph` / reorder, verificar fideos agridulces (Mezclar→Dorar, maicena solo en mezclar) y pasta caprese (join vs coat).

## 2026-11-20 — Login Google redirige a Netlify 404

**Síntoma:** al entrar o abrir `/api/auth/...` aparece “Page not found” de Netlify; URL sin `/recetas`.
**Contexto:** app en `https://katiagadea.com.ar/recetas` (basePath); el sitio raíz del dominio lo sirve Netlify vía nginx.
**Causa:** (1) Auth.js `pages.signIn=/login` genera `https://katiagadea.com.ar/login` (Netlify). (2) `authorized` no strippaba `/recetas`. (3) Faltaban AUTH_* en el VPS. (4) Next strippea `/recetas` antes del route; Auth.js armaba `callbackUrl` en `/api/auth/...` sin prefijo.
**Solución:** pages con `/recetas`; `isPublicPath` normalizado; Auth.js `basePath=/recetas/api/auth`; wrapper en `api/auth/[...nextauth]` que reinyecta `/recetas` + origen de `AUTH_URL`; `AUTH_URL=https://katiagadea.com.ar/recetas/api/auth` + secrets en el VPS. Entrar por `/recetas/login`.
**Prevención:** no usar `/api/auth` en la raíz del dominio; al cambiar basePath, mantener el wrapper y AUTH_URL alineados.

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
