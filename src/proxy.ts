import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// First line of defense only: pages still call requireUser().
// Read-only on purpose: the NextAuth() `auth` wrapper re-issues the session
// cookie, which can race with the Set-Cookie that signOut() sends.
//
// It also sends signed-in users away from the landing and login pages, so those two
// pages never read the session themselves and stay fully static (see LESSONS.md).
export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const signedIn = !!token?.id;
  const { pathname } = request.nextUrl;

  if (pathname === "/" || pathname === "/login") {
    return signedIn
      ? NextResponse.redirect(new URL("/projects", request.url))
      : NextResponse.next();
  }

  if (signedIn) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/", "/login", "/projects/:path*"],
};
