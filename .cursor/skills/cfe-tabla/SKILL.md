---
name: cfe-tabla
description: >-
  Reglas y checklist de tablas Cooking for Engineers (CFE) en Recetas.
  Usar cuando se genere, regenere, audite o depure CFE; cuando la usuaria
  mencione Cooking for Engineers, tabla CFE, rowspan, streams de wok,
  Mezclar/Dorar invertidos, o errores de orden de pasos en la tabla.
---

# CFE / Cooking for Engineers

## Dónde viven las instrucciones (no confundir)

| Qué | Dónde | Quién las lee |
|---|---|---|
| Prompt de generación | `web/src/lib/cfe-ai-rules.ts` | IA OpenRouter al estructurar/rebuild |
| Post-proceso / guards | `web/src/lib/cfe.ts` | Código (sin IA): orden, acumulación, dedupe |
| Orquestación + repair | `web/src/lib/structure-recipe.ts` | Llama al modelo + `diagnoseCfeIssues` |
| Este skill | `.cursor/skills/cfe-tabla/` | Agente Cursor al tocar CFE |

**Importante:** un skill de Cursor **no** se inyecta solo en OpenRouter. Para que la IA de generación mejore, hay que editar `cfe-ai-rules.ts` (y/o guards en `cfe.ts`).

## Cuando la usuaria reporta CFE mal

1. Leer pasos clásicos + `cfeJson` de la receta (no inventar).
2. Comparar contra `CFE_KNOWN_FAILURES` en `cfe-ai-rules.ts`.
3. Preferir fix en este orden:
   - **Guard en `cfe.ts`** si es determinístico (orden coat→cook, strip maicena, acumular wok).
   - **Regla en `cfe-ai-rules.ts`** si es semántica (cómo pensar streams/joins).
   - Rebuild: `npm run rebuild:bad-cfe -- --slug=... --force`.
4. Verificar en UI: izquierda→derecha = tiempo; Mezclar a la izquierda de Dorar.
5. Si el error es nuevo y reusable → entrada en `.cursor/problemas-resueltos.md` **y** una línea en `CFE_KNOWN_FAILURES` / checklist de `cfe-ai-rules.ts`.

## Checklist rápido (tabla correcta)

- [ ] Streams paralelos (wok ∥ tofu ∥ fideos) con join al final
- [ ] Al agregar al wok, `ingredientIds` incluye lo que ya estaba
- [ ] Coat → cook: Mezclar/rebozar **antes** (izquierda) de Dorar/freír/asar
- [ ] Dorar/freír **sin** maicena/harina si ya se mezcló
- [ ] Condimento compartido (soja/sal) solo en el primer stream
- [ ] Join final cubre casi todos los ingredientes
- [ ] Sin durations inventadas
- [ ] Verbos cortos (1–3 palabras)

## Comandos útiles

```bash
cd web
npm run rebuild:bad-cfe -- --dry-run
npm run rebuild:bad-cfe -- --slug=fideos-chinos-agridulces --force
npm run refine:cfe
```

## Fuente de verdad del prompt

Al cambiar reglas de generación, editar **solo** `web/src/lib/cfe-ai-rules.ts` (`CFE_RULES_FOR_STRUCTURE`, `CFE_ACTIONS_SYSTEM`, `CFE_KNOWN_FAILURES`). `structure-recipe.ts` las importa.
