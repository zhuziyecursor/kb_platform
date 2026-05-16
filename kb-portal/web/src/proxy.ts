import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/'];
const LOGIN_PATH = '/login';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 登录页不需要拦截
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // 检查是否是受保护的路径
  const isProtectedPath = PROTECTED_PATHS.some(path =>
    pathname === path || pathname.startsWith(path + '/')
  );

  if (isProtectedPath) {
    const isLoggedIn = request.cookies.get('isLoggedIn')?.value === 'true';

    if (!isLoggedIn) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/spaces/:path*', '/documents/:path*', '/rag/:path*', '/skills/:path*', '/experts/:path*', '/agent/:path*'],
};
