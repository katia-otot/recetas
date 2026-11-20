import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }
  return {
    id: userId,
    email: session.user?.email ?? null,
    name: session.user?.name ?? null,
  };
}
