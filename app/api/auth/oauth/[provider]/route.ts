import { NextResponse } from 'next/server';
import { beginOAuth, type OAuthProvider } from '@/lib/oauth';
import { rateLimit } from '@/lib/redis';
import { clientIp } from '@/lib/utils';

export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){const {provider}=await params;if(provider!=='google'&&provider!=='apple')return NextResponse.json({error:'Unsupported sign-in provider.'},{status:404});if(!(await rateLimit(`oauth:${provider}:${clientIp(request.headers.get('x-forwarded-for'))}`,10,3600)))return NextResponse.json({error:'Too many sign-in attempts. Try again later.'},{status:429});try{const incoming=new URL(request.url);const next=incoming.searchParams.get('next');const target=next&&next.startsWith('/')&&!next.startsWith('//')?next:'/dashboard';return NextResponse.redirect(await beginOAuth(provider as OAuthProvider,target))}catch(error){const url=new URL('/onboarding?mode=login',request.url);url.searchParams.set('authError',error instanceof Error?error.message:'Sign-in is not available.');return NextResponse.redirect(url)}}
