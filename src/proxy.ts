import { NextResponse, type NextRequest } from "next/server";

/**
 * Barreira rápida: sem cookie de sessão, vai para o login.
 * A validação real (sessão no banco + permissões) acontece no servidor de cada tela/ação.
 */
const PUBLIC = ["/login", "/manifest.webmanifest", "/sw.js", "/offline", "/api/cron"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!request.cookies.has("ri_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|icons/|placeholders/|robots.txt).*)"],
};
