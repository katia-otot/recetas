import {
  formatCfeActionLabel,
  layoutActionGraph,
} from "@/lib/cfe";
import type { CfeData } from "@/lib/recipe-schema";

type CellPlacement = {
  row: number;
  col: number;
  rowspan: number;
  content: string;
  kind: "ingredient" | "action" | "final" | "empty";
};

type PreparedAction = {
  column: number;
  verb: string;
  rows: number[];
};

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
} {
  const rowCount = cfe.ingredients.length;
  const actions = prepareActions(cfe);
  const maxActionCol = actions.reduce((m, a) => Math.max(m, a.column), 0);
  const finalCol = maxActionCol + 1;
  const colCount = Math.max(finalCol + 1, 2);

  const cells: CellPlacement[] = [];
  const skip = new Set<string>();
  const occupied = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => false),
  );

  cfe.ingredients.forEach((ing, row) => {
    cells.push({
      row,
      col: 0,
      rowspan: 1,
      content: ing.label,
      kind: "ingredient",
    });
    occupied[row][0] = true;
  });

  for (const action of actions) {
    const startRow = action.rows[0];
    const endRow = action.rows[action.rows.length - 1];
    const rowspan = endRow - startRow + 1;

    // Si ya hay otra acción en esa celda (mismo col/fila), no pisar.
    if (occupied[startRow][action.column]) continue;

    cells.push({
      row: startRow,
      col: action.column,
      rowspan,
      content: action.verb,
      kind: "action",
    });

    for (let r = startRow; r <= endRow; r++) {
      occupied[r][action.column] = true;
      if (r > startRow) skip.add(`${r}:${action.column}`);
    }
  }

  if (rowCount > 0) {
    cells.push({
      row: 0,
      col: finalCol,
      rowspan: rowCount,
      content: formatFinalAction(cfe.finalAction),
      kind: "final",
    });
    for (let r = 0; r < rowCount; r++) {
      occupied[r][finalCol] = true;
      if (r > 0) skip.add(`${r}:${finalCol}`);
    }
  }

  // Huecos → "—" para que se vea cuándo entra cada ingrediente.
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

  return { rowCount, colCount, cells, skip };
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
  const { rowCount, colCount, cells, skip } = buildPlacements(cfe);

  if (rowCount === 0) {
    return (
      <p className="text-sm text-stone-500">
        Todavía no hay tabla Cooking for Engineers para esta receta.
      </p>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      {cfe.prepRows.length > 0 && (
        <div className="mb-3 space-y-1 break-words rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm text-stone-800">
          {cfe.prepRows.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs text-stone-500 sm:hidden">
        Deslizá la tabla hacia los costados →
      </p>

      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <table className="w-max min-w-full border-collapse text-xs sm:text-sm">
          <caption className="mb-2 text-left text-sm font-semibold text-stone-900 sm:text-base">
            {title} — Cooking for Engineers
          </caption>
          <tbody>
            {Array.from({ length: rowCount }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: colCount }, (_, col) => {
                  if (skip.has(`${row}:${col}`)) return null;
                  const placement = cellAt(cells, row, col);
                  if (!placement) return null;

                  const bg =
                    placement.kind === "ingredient"
                      ? "bg-white"
                      : placement.kind === "final"
                        ? "bg-amber-50"
                        : placement.kind === "empty"
                          ? "bg-white"
                          : "bg-green-50";

                  const sticky =
                    placement.kind === "ingredient"
                      ? "sticky left-0 z-10 shadow-[2px_0_0_0_rgba(22,101,52,0.35)]"
                      : "";

                  const align =
                    placement.kind === "action" || placement.kind === "final"
                      ? "text-center align-middle"
                      : "align-top";

                  return (
                    <td
                      key={col}
                      rowSpan={
                        placement.rowspan > 1 ? placement.rowspan : undefined
                      }
                      className={`max-w-[11rem] border border-green-600 px-2 py-2 text-stone-800 sm:max-w-none sm:px-3 ${bg} ${sticky} ${align} ${
                        placement.kind === "empty" ? "text-stone-400" : ""
                      } ${
                        placement.kind !== "empty"
                          ? "break-words [overflow-wrap:anywhere]"
                          : ""
                      }`}
                    >
                      {placement.content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
