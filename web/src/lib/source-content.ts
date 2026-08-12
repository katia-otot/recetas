const MAX_SOURCE_CHARS = 14_000;
const URL_REGEX = /https?:\/\/[^\s,;<>)"']+/gi;

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

function extractJsonLd(html: string): string[] {
  const blocks: string[] = [];
  const pattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const value = decodeHtml(match[1].trim());
    if (/recipe|ingredients|recipeInstructions/i.test(value)) {
      blocks.push(value);
    }
  }

  return blocks;
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
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
}

function htmlToText(html: string): string {
  return decodeHtml(
    stripNonRecipeSections(html)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Prefiere JSON-LD de Recipe (sin comentarios del blog).
 * El HTML plano se usa solo de respaldo y ya filtrado.
 */
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

    const jsonLd = extractJsonLd(html).join("\n\n").trim();
    const source = jsonLd || htmlToText(html);

    return source.slice(0, MAX_SOURCE_CHARS) || null;
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
