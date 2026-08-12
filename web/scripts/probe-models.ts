import "../src/lib/load-env";

const models = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "openai/gpt-oss-20b:free",
  "openrouter/free",
];

async function test(model: string) {
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Recetas",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: 'Responde JSON: {"ok":true}',
        },
      ],
      max_tokens: 80,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  const data = await res.json();
  console.log(
    model,
    res.status,
    `${Date.now() - started}ms`,
    data?.choices?.[0]?.message?.content ?? data?.error?.message,
  );
}

async function main() {
  for (const model of models) {
    try {
      await test(model);
    } catch (error) {
      console.log(model, "ERR", (error as Error).message);
    }
  }
}

main();
