import { handlers } from "@/auth";
import { getBasePath } from "@/lib/base-path";
import { NextRequest } from "next/server";

/**
 * Next.js basePath strippea `/recetas` antes del App Router. Auth.js necesita
 * ver el path público (`/recetas/api/auth/...`) para armar callback/signin URLs.
 */
function withPublicAuthUrl(req: NextRequest): NextRequest {
  const base = getBasePath();
  if (!base) return req;

  const url = new URL(req.url);
  if (!url.pathname.startsWith(base)) {
    url.pathname = `${base}${url.pathname}`;
  }

  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (authUrl) {
    const auth = new URL(authUrl);
    url.protocol = auth.protocol;
    url.host = auth.host;
  }

  return new NextRequest(url, req);
}

export async function GET(req: NextRequest) {
  return handlers.GET(withPublicAuthUrl(req));
}

export async function POST(req: NextRequest) {
  return handlers.POST(withPublicAuthUrl(req));
}
