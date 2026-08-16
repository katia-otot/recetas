"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCfeActionLabel,
  layoutActionGraph,
  refineStoredCfe,
  reorderIngredientsForActions,
} from "@/lib/cfe";
import type { CfeData } from "@/lib/recipe-schema";
import {
  readHaveIngredients,
  writeHaveIngredients,
} from "@/lib/have-ingredients";

type CellPlacement = {
  row: number;
  col: number;
  rowspan: number;
  content: string;
  kind: "ingredient" | "action" | "final" | "empty";
  ingredientId?: string;
};

type PreparedAction = {
  column: number;
  verb: string;
  rows: number[];
};

/** Agrupa filas contiguas: nunca rowspan sobre ingredientes que no están en la acción. */
function contiguousRuns(rows: number[]): number[][] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a - b);
  const runs: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const run = runs[runs.length - 1];
    if (sorted[i] === run[run.length - 1] + 1) {
      run.push(sorted[i]);
    } else {
      runs.push([sorted[i]]);
    }
  }
  return runs;
}

function prepareActions(cfe: CfeData): PreparedAction[] {
  const idToRow = new Map(cfe.ingredients.map((ing, i) => [ing.id, i]));
  const laidOut = layoutActionGraph(cfe.actions);

  const withRows = laidOut
    .map((action) => {
      const rows = [
        ...new Set(
          action.ingredientIds
            .map((id) => idToRow.get(id))
            .filter((r): r is number => r !== undefined),
        ),
      ].sort((a, b) => a - b);

      return {
        column: action.column,
        verb: formatCfeActionLabel(action),
        rows,
      };
    })
    .filter((action) => action.verb && action.rows.length > 0)
    .sort((a, b) => a.column - b.column || a.rows[0] - b.rows[0]);

  const uniqueCols = [...new Set(withRows.map((a) => a.column))];
  const colMap = new Map(uniqueCols.map((col, index) => [col, index + 1]));

  return withRows.map((action) => ({
    ...action,
    column: colMap.get(action.column)!,
  }));
}

/**
 * Tabla CFE legible: ingredientes | acciones | final.
 * Celdas sin acción se muestran como "—" (como en el formato claro preferido).
 */
function buildPlacements(cfe: CfeData): {
  rowCount: number;
  colCount: number;
  cells: CellPlacement[];
  skip: Set<string>;
  orderedIngredients: CfeData["ingredients"];
} {
  const orderedIngredients = reorderIngredientsForActions(
    cfe.ingredients,
    cfe.actions,
  );
  const ordered: CfeData = {
    ...cfe,
    ingredients: orderedIngredients,
  };
  const rowCount = ordered.ingredients.length;
  const actions = prepareActions(ordered);
  const maxActionCol = actions.reduce((m, a) => Math.max(m, a.column), 0);
  const finalCol = maxActionCol + 1;
  const colCount = Math.max(finalCol + 1, 2);

  const cells: CellPlacement[] = [];
  const skip = new Set<string>();
  const occupied = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => false),
  );

  ordered.ingredients.forEach((ing, row) => {
    cells.push({
      row,
      col: 0,
      rowspan: 1,
      content: ing.label,
      kind: "ingredient",
      ingredientId: ing.id,
    });
    occupied[row][0] = true;
  });

  for (const action of actions) {
    for (const run of contiguousRuns(action.rows)) {
      const startRow = run[0];
      const rowspan = run.length;
      if (occupied[startRow][action.column]) continue;

      cells.push({
        row: startRow,
        col: action.column,
        rowspan,
        content: action.verb,
        kind: "action",
      });

      for (let r = startRow; r < startRow + rowspan; r++) {
        occupied[r][action.column] = true;
        if (r > startRow) skip.add(`${r}:${action.column}`);
      }
    }
  }

  if (rowCount > 0) {
    cells.push({
      row: 0,
      col: finalCol,
      rowspan: rowCount,
      content: formatFinalAction(ordered.finalAction),
      kind: "final",
    });
    for (let r = 0; r < rowCount; r++) {
      occupied[r][finalCol] = true;
      if (r > 0) skip.add(`${r}:${finalCol}`);
    }
  }

  for (let row = 0; row < rowCount; row++) {
    for (let col = 1; col < finalCol; col++) {
      if (occupied[row][col] || skip.has(`${row}:${col}`)) continue;
      cells.push({
        row,
        col,
        rowspan: 1,
        content: "—",
        kind: "empty",
      });
    }
  }

  return { rowCount, colCount, cells, skip, orderedIngredients };
}

function formatFinalAction(final: CfeData["finalAction"]): string {
  const parts = [final.verb];
  if (final.tempC != null) parts.push(`${final.tempC}°C`);
  if (final.tempF != null) parts.push(`${final.tempF}°F`);
  if (final.duration) parts.push(final.duration);
  if (final.notes) parts.push(final.notes);
  return parts.filter(Boolean).join(" · ");
}

function cellAt(
  cells: CellPlacement[],
  row: number,
  col: number,
): CellPlacement | undefined {
  return cells.find((c) => c.row === row && c.col === col);
}

export function CfeTable({ cfe, title }: { cfe: CfeData; title: string }) {
  const displayCfe = useMemo(() => refineStoredCfe(cfe) ?? cfe, [cfe]);
  const { rowCount, colCount, cells, skip, orderedIngredients } = useMemo(
    () => buildPlacements(displayCfe),
    [displayCfe],
  );

  const [haveIds, setHaveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHaveIds(readHaveIngredients(title));
  }, [title]);

  function toggleHave(ingredientId: string) {
    setHaveIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      writeHaveIngredients(title, next);
      return next;
    });
  }

  if (rowCount === 0) {
    return (
      <p className="text-sm text-stone-500">
        Todavía no hay tabla Cooking for Engineers para esta receta.
      </p>
    );
  }

  const rowIdByIndex = orderedIngredients.map((ing) => ing.id);

  return (
    <div className="min-w-0 max-w-full">
      {displayCfe.prepRows.length > 0 && (
        <div className="mb-3 space-y-1 break-words rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm text-stone-800">
          {displayCfe.prepRows.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs text-stone-500">
        Tocá un ingrediente para marcar que ya lo tenés.
        <span className="sm:hidden"> Deslizá la tabla →</span>
      </p>

      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <table className="w-max min-w-full border-collapse text-xs sm:text-sm">
          <caption className="mb-2 text-left text-sm font-semibold text-stone-900 sm:text-base">
            {title} — Cooking for Engineers
          </caption>
          <tbody>
            {Array.from({ length: rowCount }, (_, row) => {
              const rowHave = haveIds.has(rowIdByIndex[row]);
              return (
                <tr key={row}>
                  {Array.from({ length: colCount }, (_, col) => {
                    if (skip.has(`${row}:${col}`)) return null;
                    const placement = cellAt(cells, row, col);
                    if (!placement) return null;

                    const isIngredient = placement.kind === "ingredient";
                    const checked =
                      isIngredient &&
                      placement.ingredientId != null &&
                      haveIds.has(placement.ingredientId);

                    const bg = checked
                      ? "bg-green-200"
                      : placement.kind === "ingredient"
                        ? rowHave
                          ? "bg-green-200"
                          : "bg-white"
                        : placement.kind === "final"
                          ? "bg-amber-50"
                          : placement.kind === "empty"
                            ? rowHave
                              ? "bg-green-50"
                              : "bg-white"
                            : rowHave
                              ? "bg-green-100"
                              : "bg-green-50";

                    const sticky = isIngredient
                      ? "sticky left-0 z-10 shadow-[2px_0_0_0_rgba(22,101,52,0.35)]"
                      : "";

                    const align =
                      placement.kind === "action" || placement.kind === "final"
                        ? "text-center align-middle"
                        : "align-middle";

                    const width = isIngredient
                      ? "w-[37.5vw] max-w-[37.5vw] sm:w-auto sm:max-w-[14rem]"
                      : placement.kind === "empty"
                        ? "min-w-[2.5rem]"
                        : "min-w-[4.5rem] max-w-[9rem] sm:max-w-none";

                    return (
                      <td
                        key={col}
                        rowSpan={
                          placement.rowspan > 1
                            ? placement.rowspan
                            : undefined
                        }
                        onClick={
                          isIngredient && placement.ingredientId
                            ? () => toggleHave(placement.ingredientId!)
                            : undefined
                        }
                        onKeyDown={
                          isIngredient && placement.ingredientId
                            ? (event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  toggleHave(placement.ingredientId!);
                                }
                              }
                            : undefined
                        }
                        role={isIngredient ? "button" : undefined}
                        tabIndex={isIngredient ? 0 : undefined}
                        aria-pressed={isIngredient ? checked : undefined}
                        title={
                          isIngredient
                            ? checked
                              ? "Marcado: ya lo tenés (tocá para quitar)"
                              : "Tocá para marcar que ya lo tenés"
                            : undefined
                        }
                        className={`border border-green-600 px-2 py-2 text-stone-800 sm:px-3 ${width} ${bg} ${sticky} ${align} ${
                          placement.kind === "empty" ? "text-stone-400" : ""
                        } ${
                          placement.kind !== "empty"
                            ? "break-words [overflow-wrap:anywhere]"
                            : ""
                        } ${
                          isIngredient
                            ? "min-h-11 cursor-pointer select-none touch-manipulation active:bg-green-300"
                            : ""
                        }`}
                      >
                        {placement.content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
