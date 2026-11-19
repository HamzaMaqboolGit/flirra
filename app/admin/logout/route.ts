import { NextResponse } from 'next/server';
import { logoutAdmin } from '@/lib/auth';
export async function GET(request: Request) {
  await logoutAdmin();
  return NextResponse.redirect(new URL('/admin/login', request.url));
}
