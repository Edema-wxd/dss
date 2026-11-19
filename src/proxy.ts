import { NextResponse, type NextRequest } from "next/server";

// An optimistic check only: no desk cookie, straight to the login page. The real check
// (a valid, unexpired session in the database) happens in the page and every server action.
// One-tap links from HQ emails (/admin/act/...) carry their own signed permission instead.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/admin/login" || path.startsWith("/admin/act/") || request.cookies.has("dss_desk")) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
