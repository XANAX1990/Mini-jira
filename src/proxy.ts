import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// First line of defense only: pages still call requireUser().
export const proxy = auth;

export const config = {
  matcher: ["/projects/:path*"],
};
