/**
 * Fuente única de reglas CFE para la IA de generación (OpenRouter).
 * Si aprendés un error nuevo, agregalo acá — no solo en un chat.
 *
 * También lo usa el skill `.cursor/skills/cfe-tabla` (para el agente de Cursor).
 */

/** Bloque largo: va dentro del SYSTEM_PROMPT de estructurado completo. */
export const CFE_RULES_FOR_STRUCTURE = `
CFE / Cooking for Engineers = grafo de STREAMS en paralelo + joins, no una lista plana:
  - Pensá en STREAMS: cada olla/sartén/bowl es un stream. Dentro del stream los pasos van en cadena (dependsOn).
    Entre streams sin dependencia → misma columna (paralelo). El join une streams y VA AL FINAL de esas ramas.
  - prepRows: SOLO notas de equipo/horno SIN tocar ingredientes (ej. "Precalentar el horno a 180°C").
    NUNCA pongas en prepRows mezclar, añadir, verter, hornear, cortar, saltear, etc. Eso va en actions.
  - Todo lo que hace algo CON ingredientes = actions, incluido cortar/salar/secar/mezclar/pincelar.
  - Micro-pasos NO son columnas: "dar la vuelta" se fusiona con el hornear/saltear anterior ("Hornear vuelta y vuelta").
  - Orden mental de filas: ingredientes del mismo stream deben poder quedar CONTIGUOS (crema+azúcar+mascarpone juntas;
    café+ron+vainillas juntas). No intercales streams.
  - Condimentos compartidos (sal/aceite/pimienta/salsa de soja) en DOS streams: asignalos al stream de la PRIMERA
    mención; no los repitas en el otro stream salvo el join final.
  - Cada action es un nodo. dependsOn = índices 1-based de acciones que DEBEN terminar antes (solo < índice actual).
  - Las columnas las calcula el sistema: misma columna = paralelo; más a la derecha = después.
  - SECUENCIA en la misma sartén = DOS o más actions, NUNCA un solo Saltear gigante.
    Ejemplo arroz: "saltear ajo 1 min" y LUEGO "saltear espárragos 5-7 min"
      → Saltear(aceite+ajo, "1 min")
      → Saltear(aceite+ajo+esparragos, "5-7 min", dependsOn:[1])
  - ACUMULACIÓN EN SARTÉN/WOK (rowspan CFE):
    Cuando agregás algo a una sartén que YA tiene ingredientes, ingredientIds = lo anterior + lo nuevo.
    Ejemplo fideos agridulces:
      → Cocinar(cebolla)
      → Agregar(cebolla+verdeo+jengibre+ajo+pimienta, dependsOn:[1])
      → Mezclar salsa(esos + chutney+alcaparras+soja+vino+vinagre, dependsOn:[2])
    NUNCA pongas en "Agregar aromáticos" solo los nuevos sin la cebolla que ya estaba.
  - COAT antes de COCINAR el mismo grupo (izquierda → derecha en la tabla):
      "Mezclar tofu+maicena" → LUEGO "Dorar tofu" (dependsOn; Dorar NO incluye maicena en ingredientIds).
      "Mezclar brócoli+aceite+sal" → LUEGO "Asar/Hornear".
    NUNCA dorar/freír/asar ANTES de mezclar/rebozar ese mismo ítem.
    NUNCA pongas Dorar a la izquierda de Mezclar en el mismo stream.
  - duration: SOLO si consta en la receta. Si no hay tiempo, omitilo (no inventes "5-7 min").
  - verb: 1-3 palabras de técnica (Hervir, Saltear, Hornear, Cubrir, Mezclar…). NUNCA prosa ni "y servir".
  - Al unir resultados previos, ingredientIds incluye TODAS las filas que abarca ese join.
  - Join final delgado PROHIBIDO: si al final mezclás/armás el plato, ingredientIds debe cubrir casi todos los
    ingredientes cocidos/prep (no solo el limón o el perejil).
  - NUNCA un Mezclar/Incorporar de TODOS mientras otro stream todavía se saltea/asa/hierve.
  - Ejemplo "Pasta caprese" (paralelo + merge):
      Hervir(pasta) ∥ Saltear(aceite+tomates+sal) → Mezclar(esos 4) → Incorporar(todos)
  - Ejemplo "Fideos agridulces" (3 streams):
      Wok: Cocinar(cebolla) → Agregar(+verdeo+jengibre+ajo+pimienta) → Mezclar(+chutney+alcaparras+soja+vino+vinagre)
      ∥ Tofu: Mezclar(tofu+maicena) → Dorar(tofu)   ∥ Fideos: Hervir(fideos)
      → Incorporar(todos)
  - Ejemplo tiramisú (2 streams):
      Batir(crema+azúcar) → Mezclar(+mascarpone)  ∥  Mezclar(café+ron) → Remojar(+vainillas)  → Armar(todos) → Espolvorear(cacao)
  - Checklist antes de responder:
    (1) ¿secuencia de sartén partida?
    (2) ¿ids acumulados en el wok?
    (3) ¿coat ANTES de cook (Mezclar izquierda, Dorar derecha)?
    (4) ¿Dorar/freír sin maicena/harina si ya se mezcló?
    (5) ¿joins finales completos?
    (6) ¿dependsOn coherente?
    (7) ¿verbs cortos?
    (8) ¿todos los ids cubiertos?
    (9) ¿condimentos compartidos sin duplicar filas?
    (10) ¿sin durations inventadas?
  - cfe.ingredients: UNA fila por cada item de "ingredients", mismo orden; label con nombre completo.
  - id en snake_case. column número (se recalcula). NUNCA column="mix".
  - NO uses "combinar" si hay calor/sartén → "saltear" o "cocinar".
  - NUNCA actions con ingredientIds vacío.
  - finalAction SIEMPRE objeto: { "verb":"…", "tempC":null, "tempF":null, "duration":"", "notes":"" }.
  - Si no podés armar un CFE coherente, devolvé cfe con ingredients/actions vacíos.
`.trim();

/** Prompt corto: segundo pase solo de actions (`completeCfeActions`). */
export const CFE_ACTIONS_SYSTEM = `Armás SOLO las acciones CFE (grafo de streams) en español.
Los ingredientes (id + label) son FIJOS: no los cambies ni inventes otros.
Devolvé JSON: { "prepRows": string[], "actions": [{ "column": number, "verb": string, "ingredientIds": string[], "duration": "5-7 min", "dependsOn": [1] }], "finalAction": { "verb": string, "tempC": null, "tempF": null, "duration": "", "notes": "" } }

Reglas clave:
- Streams: cada olla/sartén/bowl es un stream en cadena; streams independientes van en paralelo.
- prepRows: SOLO "Precalentar el horno…" u otras notas de equipo SIN ingredientes.
- Prep/coat de ingredientes va en actions (cortar, mezclar aceite, pincelar…).
- COAT antes de COOK (izquierda→derecha): Mezclar(tofu+maicena) → Dorar(tofu). Nunca Dorar a la izquierda de Mezclar.
- Dorar/freír: ingredientIds = solo el alimento (tofu), NO la maicena/harina del mezclar previo.
- Al AGREGAR a un wok/sartén, ingredientIds = contenido previo + lo nuevo (acumulá la sartén).
  Ej: Cocinar(cebolla) → Agregar(cebolla+verdeo+ajo+…) → Mezclar(+salsa…).
- Secuencia en sartén = varias actions + dependsOn. NUNCA un Saltear gigante si los agrega de a uno.
- Micro-pasos ("dar la vuelta") → fusionar con hornear/saltear anterior.
- Join final: ingredientIds cubre casi TODO lo cocido/prep.
- Condimento en dos streams → asignarlo al primero; no lo repitas en el otro.
- verb corto (1-3 palabras). NUNCA frases largas.
- duration SOLO si consta en los pasos; no inventes tiempos.
- Al incorporar streams, ingredientIds = unión de ambos.
- TODOS los ids deben aparecer en alguna action.
- Checklist: acumulación wok, coat→cook (Mezclar izq / Dorar der), dorar sin maicena, joins, dependsOn, verbs, cobertura, condimentos sin duplicar.`;

/** Errores históricos — usar en repair feedback o al auditar. */
export const CFE_KNOWN_FAILURES = [
  "Dorar/freír ANTES de Mezclar/rebozar el mismo ítem (orden de columnas invertido)",
  "Dorar abarca maicena/harina (debe quedar solo en el Mezclar previo)",
  "Agregar al wok sin incluir lo que ya estaba en la sartén (rompe rowspan)",
  "Saltear aplastado: ajo+verdura+frutos en un solo paso cuando la receta los secuencia",
  "Join final solo con limón/perejil (debe cubrir casi todos los streams)",
  "Condimento compartido (soja/sal) en dos streams partiendo filas contiguas",
  "Durations inventadas cuando la receta no trae tiempos (post-proceso las borra si steps no tienen min)",
  "Verbos en prosa larga en vez de 1-3 palabras de técnica",
  "False positive 'asar' dentro de 'amasar' — el cook verb usa \\basar\\b",
  "Mezclar y servir como join final NO es cook_left_of_mix (no forzar rebuild)",
] as const;
