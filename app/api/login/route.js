import { NextResponse } from "next/server";

export async function POST(request) {
  const { password } = await request.json();
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "Server is missing APP_PASSWORD." },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("zaviri_auth", expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
