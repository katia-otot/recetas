import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { INVITE_COOKIE, userHasValidInviteCookie } from "@/lib/lists";

function allowedEmails(): string[] {
  return (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isPublicPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/invitar/") ||
    path.startsWith("/api/invitar/")
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      const allow = allowedEmails();
      if (allow.length === 0) return true;

      const email = user.email?.toLowerCase();
      if (email && allow.includes(email)) return true;

      // Permitir entrar si hay una invitación válida pendiente (cookie del link)
      try {
        const jar = await cookies();
        const token = jar.get(INVITE_COOKIE)?.value;
        if (await userHasValidInviteCookie(token, email)) return true;
      } catch {
        // cookies() puede fallar fuera de request; en ese caso denegar
      }

      return false;
    },
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return !!auth;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? token.sub ?? "";
      }
      return session;
    },
  },
});
