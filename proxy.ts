import { NextResponse } from "next/server";
import { auth } from "./auth";

export default auth((request) => {
  if (request.auth) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: "Sign in with Google to continue.", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const signIn = new URL("/login", request.nextUrl.origin);
  signIn.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: ["/((?!api/auth|api/health|login|_next/static|_next/image|favicon.svg|og.png).*)"],
};
