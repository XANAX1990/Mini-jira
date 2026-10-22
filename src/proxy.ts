import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// First line of defense only: pages still call requireUser().
// Read-only on purpose: the NextAuth() `auth` wrapper re-issues the session
// cookie, which can race with the Set-Cookie that signOut() sends.
export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (token?.id) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/projects/:path*"],
};
