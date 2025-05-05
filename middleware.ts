import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

// anything listed here will NOT get redirected to Clerk’s hosted sign-in
const isPublicRoute = createRouteMatcher([
  "/",             // allow your main page through
  "/api/(.*)",     // allow all API endpoints through (e.g. /api/threads)
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)",
    "/api(.*)",
  ],
};