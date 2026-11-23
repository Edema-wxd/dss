import { NextResponse, type NextRequest } from "next/server";
import { HQ, loginFor, movedFrom } from "@/lib/routes";

// Two signed-in areas share one account and one session cookie:
//   /savvy-hq      DSS HQ
//   /session-desk  the Visibility Sessions desk
// This is an optimistic check only: no desk cookie, straight to that area's sign-in page. The
// real check (a valid, unexpired session in the database, and roles that cover the area) happens
// in the page and every server action. One-tap links from HQ emails (/savvy-hq/act/...) carry
// their own signed permission instead.
//
// The old /admin addresses (bookmarks, and links in emails already sent) move to their new home.

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const to = new URL(movedFrom(pathname) + search, request.url);
    return NextResponse.redirect(to, 308);
  }

  const login = loginFor(pathname);
  if (pathname === login || pathname.startsWith(`${HQ}/act/`) || request.cookies.has("dss_desk")) return NextResponse.next();
  return NextResponse.redirect(new URL(login, request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/savvy-hq", "/savvy-hq/:path*", "/session-desk", "/session-desk/:path*"],
};
