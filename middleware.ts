import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup', '/auth/callback'];
  
  // Explicitly allow public routes (no redirect)
  // This ensures users can access login/signup pages without authentication
  // Important: Don't redirect if already on /login to prevent infinite loops
  if (publicRoutes.includes(pathname) || pathname.startsWith('/auth/callback')) {
    return NextResponse.next();
  }

  // Allow all other routes to proceed (auth checks happen in AuthContext)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|logo|vercel|window|file|globe).*)',
  ],
};
