import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getBasePath } from "@/lib/base-path";
import { INVITE_COOKIE, userHasValidInviteCookie } from "@/lib/lists";
import { SHARE_COOKIE, userHasValidShareCookie } from "@/lib/recipe-share";

const appBasePath = getBasePath();

function allowedEmails(): string[] {
  return (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Pathname del request a veces incluye basePath (/recetas/...). */
function pathWithoutBase(path: string): string {
  if (appBasePath && (path === appBasePath || path.startsWith(`${appBasePath}/`))) {
    const stripped = path.slice(appBasePath.length);
    return stripped || "/";
  }
  return path;
}

function isPublicPath(path: string): boolean {
  const p = pathWithoutBase(path);
  return (
    p === "/login" ||
    p.startsWith("/login/") ||
    p.startsWith("/api/auth") ||
    p.startsWith("/invitar/") ||
    p.startsWith("/api/invitar/") ||
    p.startsWith("/r/") ||
    p.startsWith("/api/r/")
  );
}

function appPath(path: string): string {
  return `${appBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "jwt" },
  // Público real: /recetas/api/auth. El route handler reinyecta /recetas porque
  // Next lo strippea antes de llegar a Auth.js.
  basePath: appPath("/api/auth"),
  // Sin /recetas, Auth.js manda a /login en el dominio raíz (Netlify 404).
  pages: {
    signIn: appPath("/login"),
    error: appPath("/login"),
  },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      const allow = allowedEmails();
      if (allow.length === 0) return true;

      const email = user.email?.toLowerCase();
      if (email && allow.includes(email)) return true;

      // Permitir entrar con invitación de lista o link de receta compartida
      try {
        const jar = await cookies();
        const inviteToken = jar.get(INVITE_COOKIE)?.value;
        if (await userHasValidInviteCookie(inviteToken, email)) return true;
        const shareToken = jar.get(SHARE_COOKIE)?.value;
        if (await userHasValidShareCookie(shareToken)) return true;
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
