"use client";

import { useState } from "react";
import { AddManualRecipeForm } from "@/components/AddManualRecipeForm";
import { ImportLinkForm } from "@/components/ImportLinkForm";

type Mode = "link" | "manual";

export function AddRecipePanel({
  initialMode = "link",
  listId,
}: {
  initialMode?: Mode;
  listId?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-stone-300 bg-white p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`min-h-11 rounded-lg px-3 py-2 ${
            mode === "link"
              ? "bg-amber-600 text-white"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          Desde un link
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`min-h-11 rounded-lg px-3 py-2 ${
            mode === "manual"
              ? "bg-amber-600 text-white"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          A mano
        </button>
      </div>

      {mode === "link" ? (
        <>
          <p className="mt-4 text-sm leading-relaxed text-stone-600">
            Pegá el link de una receta en texto. La app la estructura con IA
            (ingredientes, pasos y tabla Cooking for Engineers).
          </p>
          <ImportLinkForm listId={listId} />
        </>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-stone-600">
            Escribí título, ingredientes y pasos. Después la IA arma la tabla
            Cooking for Engineers.
          </p>
          <AddManualRecipeForm listId={listId} />
        </>
      )}
    </div>
  );
}
