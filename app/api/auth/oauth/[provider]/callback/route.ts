import { NextResponse } from 'next/server';
import { finishOAuth, type OAuthProvider } from '@/lib/oauth';

export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){const {provider}=await params;if(provider!=='google'&&provider!=='apple')return NextResponse.json({error:'Unsupported sign-in provider.'},{status:404});try{return NextResponse.redirect(await finishOAuth(provider as OAuthProvider,request.url))}catch(error){const url=new URL('/onboarding?mode=login',request.url);url.searchParams.set('authError',error instanceof Error?error.message:'Sign-in could not be completed.');return NextResponse.redirect(url)}}
