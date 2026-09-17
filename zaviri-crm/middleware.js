import { NextResponse } from "next/server";

const COOKIE_NAME = "zaviri_auth";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow the login page itself and the login API to load,
  // otherwise nobody could ever get in.
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
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
