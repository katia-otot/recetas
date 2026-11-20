const MAX_SOURCE_CHARS = 14_000;
const URL_REGEX = /https?:\/\/[^\s,;<>)"']+/gi;

type ParsedRecipe = {
  name: string;
  description: string;
  yield: string;
  ingredients: string[];
  instructions: string[];
};

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  return [
    ...new Set(
      matches.map((url) => url.replace(/[.,;]+$/, "")).filter(Boolean),
    ),
  ];
}

export function isUnusableRecipeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com\/reel/i.test(
    url,
  );
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return decodeHtml(value).trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return decodeHtml(obj.text).trim();
    if (typeof obj.name === "string") return decodeHtml(obj.name).trim();
  }
  return "";
}

function asStringList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((line) => decodeHtml(line).trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => asStringList(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.itemListElement) return asStringList(obj.itemListElement);
    const text = asText(value);
    return text ? [text] : [];
  }
  return [];
}

function parseJsonLdBlock(raw: string): unknown | null {
  const cleaned = raw
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function collectRecipeNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectRecipeNodes(item, out);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  if (obj["@graph"]) collectRecipeNodes(obj["@graph"], out);

  const types = (Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]])
    .filter(Boolean)
    .map((type) => String(type).toLowerCase());
  if (types.includes("recipe")) out.push(obj);
}

function parseRecipeNode(obj: Record<string, unknown>): ParsedRecipe {
  return {
    name: asText(obj.name),
    description: asText(obj.description),
    yield: asText(obj.recipeYield),
    ingredients: asStringList(obj.recipeIngredient),
    instructions: asStringList(obj.recipeInstructions),
  };
}

function extractJsonLdRecipes(html: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = [];
  const pattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const parsed = parseJsonLdBlock(match[1]);
    if (!parsed) continue;
    const nodes: Record<string, unknown>[] = [];
    collectRecipeNodes(parsed, nodes);
    for (const node of nodes) recipes.push(parseRecipeNode(node));
  }

  return recipes;
}

function pickBestJsonLd(recipes: ParsedRecipe[]): ParsedRecipe | null {
  let best: ParsedRecipe | null = null;
  let bestScore = -1;
  for (const recipe of recipes) {
    const score =
      recipe.ingredients.length * 3 +
      recipe.instructions.length * 3 +
      (recipe.name ? 1 : 0) +
      (recipe.description ? 1 : 0) +
      (recipe.yield ? 1 : 0);
    if (score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function formatParsedRecipe(recipe: ParsedRecipe): string {
  const parts: string[] = [];
  if (recipe.name) parts.push(`Título: ${recipe.name}`);
  if (recipe.description) parts.push(recipe.description);
  if (recipe.yield) parts.push(`Porciones: ${recipe.yield}`);
  if (recipe.ingredients.length) {
    parts.push(
      `Ingredientes:\n${recipe.ingredients.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  if (recipe.instructions.length) {
    parts.push(
      `Preparación:\n${recipe.instructions
        .map((step, index) => `${index + 1}. ${step}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

function stripNonRecipeSections(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(aside|section|div|footer)[^>]*(class|id)=["'][^"']*(comment|comments|disqus|reply|review|reviews|feedback|wp-block-comments)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}

function extractMainHtml(html: string): string {
  const startMatchers = [
    /class="[^"]*elementor-widget-theme-post-content[^"]*"/i,
    /class="[^"]*entry-content[^"]*"/i,
    /class="[^"]*post-content[^"]*"/i,
    /class="[^"]*(?:wprm-recipe|tasty-recipes|easyrecipe|mv-create)[^"]*"/i,
    /<article\b/i,
  ];

  let start = -1;
  for (const matcher of startMatchers) {
    const index = html.search(matcher);
    if (index >= 0) {
      start = index;
      break;
    }
  }
  if (start < 0) start = 0;

  const endCandidates = [
    html.search(/id=["']comments["']/i),
    html.search(/id=["']respond["']/i),
    html.search(/id=["']votar["']/i),
  ].filter((index) => index > start);

  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : html.length;
  const lastOpen = html.lastIndexOf("<", end);
  const lastClose = html.lastIndexOf(">", end);
  const snappedEnd = lastOpen > lastClose ? lastOpen : end;
  return html.slice(start, snappedEnd);
}

function htmlToReadableText(html: string): string {
  return decodeHtml(
    stripNonRecipeSections(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|blockquote|tr|h[1-6])>/gi, "\n")
      .replace(/<(h[1-6])[^>]*>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipToRecipeBody(text: string): string {
  const start = text.search(/\b(ingredientes|ingredients)\b/i);
  const body = start >= 0 ? text.slice(start) : text;
  const end = body.search(
    /\n(?:comentarios|comments|votar y compartir|también te puede|recetas relacionadas|deja un comentario|leave a comment|related posts)\b/i,
  );
  const clipped = end > 80 ? body.slice(0, end) : body;
  return clipped.trim();
}

function extractPageTitle(html: string): string {
  const og =
    html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"]+)["'][^>]+property=["']og:title["']/i,
    )?.[1];
  const title = og || html.match(/<title>([^<]+)/i)?.[1] || "";
  return decodeHtml(title)
    .replace(/\s*[|\-–].*$/, "")
    .trim();
}

function extractHtmlRecipeText(html: string): string {
  const main = extractMainHtml(html);
  const readable = clipToRecipeBody(htmlToReadableText(main));
  const pageTitle = extractPageTitle(html);
  if (pageTitle && !/^título:/i.test(readable)) {
    return `Título: ${pageTitle}\n\n${readable}`.trim();
  }
  return readable;
}

function joinRecipeSources(htmlText: string, jsonLdText: string): string {
  if (jsonLdText && htmlText) {
    const htmlSection = `Texto visible de la receta:\n${htmlText}`;
    const jsonSection = `Datos estructurados (JSON-LD; pueden estar incompletos o desactualizados):\n${jsonLdText}`;
    const jsonCap = Math.min(jsonSection.length, 4_000);
    const htmlCap = Math.max(1_000, MAX_SOURCE_CHARS - jsonCap - 2);
    return `${htmlSection.slice(0, htmlCap)}\n\n${jsonSection.slice(0, jsonCap)}`.slice(
      0,
      MAX_SOURCE_CHARS,
    );
  }
  return (htmlText || jsonLdText).slice(0, MAX_SOURCE_CHARS);
}

/**
 * Siempre mira HTML y JSON-LD juntos: se completan y se verifican.
 * El JSON-LD solo (aunque parezca completo) no alcanza; blogs como
 * Paulina Cocina publican schema corto y la receta real está en el HTML.
 */
export function extractRecipeSourceFromHtml(html: string): string | null {
  const jsonLd = pickBestJsonLd(extractJsonLdRecipes(html));
  const jsonLdText = jsonLd ? formatParsedRecipe(jsonLd) : "";
  const htmlText = extractHtmlRecipeText(html);
  return joinRecipeSources(htmlText, jsonLdText) || null;
}

export async function fetchRecipeSourceText(url: string): Promise<string | null> {
  if (isUnusableRecipeUrl(url)) return null;

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    if (!html.trim()) return null;

    return extractRecipeSourceFromHtml(html);
  } catch {
    return null;
  }
}

export async function fetchRecipeSources(
  urls: string[],
): Promise<Array<{ url: string; text: string }>> {
  const usable = urls.filter((url) => !isUnusableRecipeUrl(url)).slice(0, 3);
  const results = await Promise.all(
    usable.map(async (url) => ({
      url,
      text: await fetchRecipeSourceText(url),
    })),
  );

  return results.filter(
    (result): result is { url: string; text: string } =>
      typeof result.text === "string" && result.text.length > 0,
  );
}
