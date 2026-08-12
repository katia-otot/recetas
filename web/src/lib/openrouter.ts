const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("Falta OPENROUTER_API_KEY en .env.local");
  }
  return key;
}

function getModelCandidates(): string[] {
  const primary = process.env.OPENROUTER_MODEL ?? "openrouter/free";
  const fallbacks = (process.env.OPENROUTER_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

function isDeepSeekModel(model: string): boolean {
  return model.toLowerCase().includes("deepseek");
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; model: string }> {
  const models = getModelCandidates();
  const errors: string[] = [];

  for (const model of models) {
    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: { type: "json_object" },
      };

      // DeepSeek V4: thinking ON por defecto (lento/caro y a veces se cuelga).
      if (isDeepSeekModel(model)) {
        body.thinking = { type: "disabled" };
        body.reasoning = { effort: "none" };
        body.provider = {
          order: ["DeepSeek", "DeepInfra", "Novita", "Fireworks", "Together"],
          allow_fallbacks: true,
        };
      }

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: AbortSignal.timeout(180_000),
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Recetas",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        errors.push(`${model}: ${data?.error?.message ?? res.statusText}`);
        continue;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        errors.push(`${model}: respuesta vacía`);
        continue;
      }

      return { content, model: data?.model ?? model };
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }

  throw new Error(
    `No se pudo completar la solicitud a OpenRouter. Intentos: ${errors.join(" | ")}`,
  );
}
