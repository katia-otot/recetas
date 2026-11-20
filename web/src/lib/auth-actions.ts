"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle(callbackUrl?: string) {
  await signIn("google", { redirectTo: callbackUrl || "/" });
}

export async function signOutToLogin() {
  await signOut({ redirectTo: "/login" });
}
