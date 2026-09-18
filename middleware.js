import { NextResponse } from "next/server";

const COOKIE_NAME = "zaviri_auth";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow the login page itself, the login API, and the logo image
  // to load - otherwise nobody could ever get in (and the login page's own
  // logo would 404/redirect instead of rendering). The MCP endpoint is also
  // exempt from the cookie check - it's meant to be called by an AI tool
  // (Claude Code, Codex, etc), not a browser with a login cookie, so it
  // checks its own bearer-token password instead (see app/api/mcp/route.js).
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/mcp") ||
    pathname === "/logo.webp"
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME);
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    // Misconfigured deployment - fail closed with a clear message rather
    // than silently letting everyone in.
    return new NextResponse(
      "APP_PASSWORD is not set in this deployment's environment variables.",
      { status: 500 }
    );
  }

  if (cookie?.value === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
