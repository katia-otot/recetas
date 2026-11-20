import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

/** Compat: la lista se ve en home estilo Keep; compartir abre desde el ícono de colaboradores. */
export default async function ListDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/?lista=${id}`);
}
