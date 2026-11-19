import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, readSessionToken } from "./lib/session-token";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/admin/login" || path === "/admin/invitation") return NextResponse.next();

  const claims = await readSessionToken(request.cookies.get(ADMIN_COOKIE)?.value, "admin");
  if (claims) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = "/admin/login";
  destination.search = "";
  destination.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(destination);
}

export const config = { matcher: ["/admin/:path*"] };
