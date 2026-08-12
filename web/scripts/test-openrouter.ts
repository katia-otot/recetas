import "../src/lib/load-env";
import { chatCompletion } from "../src/lib/openrouter";

async function main() {
  const { content, model } = await chatCompletion([
    {
      role: "user",
      content: 'Responde JSON: {"ok": true, "mensaje": "hola"}',
    },
  ]);
  console.log("Modelo:", model);
  console.log("Respuesta:", content);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
