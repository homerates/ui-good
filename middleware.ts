// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// These routes must work for signed-out users (public share links)
const isPublicRoute = createRouteMatcher([
  "/",
  "/s(.*)",
  "/share(.*)",
  "/api/shorten(.*)",
]);

export default clerkMiddleware((auth, req) => {
  // Allow public routes without auth
  if (isPublicRoute(req)) return;

  // Everything else requires auth
  auth().protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
