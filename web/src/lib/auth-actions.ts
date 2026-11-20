"use server";

import { signIn, signOut } from "@/auth";
import { getBasePath, withBasePath } from "@/lib/base-path";

function redirectWithinApp(callbackUrl?: string): string {
  const base = getBasePath();
  if (!callbackUrl || !callbackUrl.startsWith("/")) return withBasePath("/");
  if (base && (callbackUrl === base || callbackUrl.startsWith(`${base}/`))) {
    return callbackUrl;
  }
  return withBasePath(callbackUrl);
}

export async function signInWithGoogle(callbackUrl?: string) {
  await signIn("google", { redirectTo: redirectWithinApp(callbackUrl) });
}

export async function signOutToLogin() {
  await signOut({ redirectTo: withBasePath("/login") });
}
