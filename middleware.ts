// middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware((auth, req) => {
  const pathname = req.nextUrl.pathname;

  // Public share routes MUST work signed-out
  const isPublic =
    pathname === "/share" ||
    pathname.startsWith("/s/") ||
    pathname === "/s" ||
    pathname.startsWith("/api/shorten");

  if (isPublic) return;

  auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
