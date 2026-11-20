import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ lista?: string }>;
};

/** Compat: la UI unificada vive en /agregar */
export default async function ImportLinkRedirect({ searchParams }: PageProps) {
  const { lista } = await searchParams;
  const qs = new URLSearchParams({ modo: "link" });
  if (lista) qs.set("lista", lista);
  redirect(`/agregar?${qs.toString()}`);
}
