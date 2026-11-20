/** Prefijo de path en producción (p. ej. `/recetas`). Vacío en local. */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

/** Prefija rutas absolutas de la app (`/api/...`, `/foo`) con el basePath. */
export function withBasePath(path: string): string {
  const base = getBasePath();
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}
