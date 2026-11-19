import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { currentUser, createUserSession, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readAuthProviderFlags, readAuthSecret } from '@/lib/stripe-secrets';
import { ensureOfficialConversations } from '@/lib/support';
import { safeInternalPath } from '@/lib/redirect';

export type OAuthProvider='google'|'apple';
const origin=()=>process.env.APP_URL||process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3100';
const random=()=>randomBytes(32).toString('base64url');
const cookieOptions={httpOnly:true as const,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:600};
export async function beginOAuth(provider:OAuthProvider,next:string|null){
 const flags=await readAuthProviderFlags(provider);const jar=await cookies();const state=random(),nonce=random(),verifier=random();const challenge=createHash('sha256').update(verifier).digest('base64url');
 let url:URL;
 if(provider==='google'){
  const clientId=String(flags['auth.google.clientId']||''),secret=await readAuthSecret('auth.google.clientSecret');if(flags['auth.google.enabled']!==true||!clientId||!secret)throw new Error('Google sign-in has not been configured.');
  url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',`${origin()}/api/auth/oauth/google/callback`);url.searchParams.set('response_type','code');url.searchParams.set('scope','openid email profile');url.searchParams.set('state',state);url.searchParams.set('nonce',nonce);url.searchParams.set('code_challenge',challenge);url.searchParams.set('code_challenge_method','S256');
 }else{
  const clientId=String(flags['auth.apple.clientId']||''),teamId=String(flags['auth.apple.teamId']||''),keyId=String(flags['auth.apple.keyId']||''),key=await readAuthSecret('auth.apple.privateKey');if(flags['auth.apple.enabled']!==true||!clientId||!teamId||!keyId||!key)throw new Error('Apple sign-in has not been configured.');
  url=new URL('https://appleid.apple.com/auth/authorize');url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',`${origin()}/api/auth/oauth/apple/callback`);url.searchParams.set('response_type','code');url.searchParams.set('response_mode','query');url.searchParams.set('scope','name email');url.searchParams.set('state',state);url.searchParams.set('nonce',nonce);
 }
 jar.set(`flirra_oauth_${provider}_state`,state,cookieOptions);jar.set(`flirra_oauth_${provider}_nonce`,nonce,cookieOptions);jar.set(`flirra_oauth_${provider}_verifier`,verifier,cookieOptions);jar.set(`flirra_oauth_${provider}_next`,next||'/dashboard',{...cookieOptions,httpOnly:true});return url;
}
export async function finishOAuth(provider:OAuthProvider,requestUrl:string){
 const incoming=new URL(requestUrl),jar=await cookies(),cookie=(name:string)=>jar.get(`flirra_oauth_${provider}_${name}`)?.value;
 const state=incoming.searchParams.get('state'),code=incoming.searchParams.get('code'),expected=cookie('state'),nonce=cookie('nonce'),verifier=cookie('verifier'),next=cookie('next')||'/dashboard';
 for(const name of ['state','nonce','verifier','next'])jar.delete(`flirra_oauth_${provider}_${name}`);
 if(!state||!expected||state!==expected||!nonce||!code)throw new Error('Sign-in could not be verified. Please try again.');
 const flags=await readAuthProviderFlags(provider);const clientId=String(flags[`auth.${provider}.clientId`]||'');let clientSecret:string;
 if(provider==='google')clientSecret=await readAuthSecret('auth.google.clientSecret');else{
  const teamId=String(flags['auth.apple.teamId']||''),keyId=String(flags['auth.apple.keyId']||''),privateKey=await readAuthSecret('auth.apple.privateKey');
  const key=await importPKCS8(privateKey,'ES256');clientSecret=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:keyId}).setIssuer(teamId).setSubject(clientId).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);
 }
 const tokenBody=new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,client_secret:clientSecret,redirect_uri:`${origin()}/api/auth/oauth/${provider}/callback`});if(provider==='google'&&verifier)tokenBody.set('code_verifier',verifier);
 const tokenResponse=await fetch(provider==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody,cache:'no-store',signal:AbortSignal.timeout(10000)});if(!tokenResponse.ok)throw new Error('The identity provider could not complete sign-in.');const tokens=await tokenResponse.json() as {id_token?:string};if(!tokens.id_token)throw new Error('The identity provider did not return a verified account.');
 const jwks=createRemoteJWKSet(new URL(provider==='google'?'https://www.googleapis.com/oauth2/v3/certs':'https://appleid.apple.com/auth/keys'));
 const issuer=provider==='google'?['https://accounts.google.com','accounts.google.com']:['https://appleid.apple.com'];const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer,audience:clientId});
 if(payload.nonce!==nonce||typeof payload.sub!=='string')throw new Error('Identity verification failed. Please retry sign-in.');
 const subject=payload.sub;const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';const verified=payload.email_verified===true||payload.email_verified==='true';if(!email||!verified)throw new Error('This provider did not verify an email address for the account.');
 const existingSession=await currentUser();const linked=await prisma.oAuthAccount.findUnique({where:{provider_providerAccountId:{provider,providerAccountId:subject}},include:{user:true}});
 let user=linked?.user||null;if(user&&existingSession?.isGuest&&existingSession.id!==user.id)throw new Error('This provider is already linked to another Flirra account. Sign in to that account first.');
 if(!user){
  const byEmail=await prisma.user.findUnique({where:{email}});
  if(byEmail&&existingSession?.isGuest){if(byEmail.id!==existingSession.id)throw new Error('An account already uses this email. Sign in to it before linking.');user=byEmail;}
  else if(byEmail)user=byEmail;
  else{
   const displayName=(typeof payload.name==='string'&&payload.name.trim()?payload.name.trim():email.split('@')[0]).slice(0,40);
   user=await prisma.user.create({data:{email,passwordHash:await hashPassword(random()),displayName,role:'FEMALE',accountType:'USER',emailVerifiedAt:new Date(),profile:{create:{country:''}},wallet:{create:{coinBalance:0,promotionalCoins:0}}}});
   await ensureOfficialConversations(user.id);
  }
  if(user.role==='ADMIN')throw new Error('Use administrator sign-in to access this account.');
  await prisma.oAuthAccount.create({data:{provider,providerAccountId:subject,userId:user.id}});
 }
 if(user.role==='ADMIN'||user.status!=='ACTIVE')throw new Error('This account cannot use member sign-in.');
 if(user.isGuest){await prisma.user.update({where:{id:user.id},data:{email,emailVerifiedAt:new Date(),isGuest:false,guestExpiresAt:null}});user={...user,email,isGuest:false};await ensureOfficialConversations(user.id)}
 else if(!user.emailVerifiedAt){user=await prisma.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date()}})}
 await createUserSession(user.id,user.role);
 const safeNext=safeInternalPath(next,'/dashboard');const purchase=safeNext.startsWith('/wallet?')?new URL(safeNext,'https://flirra.invalid').searchParams.get('buyPackage'):null;const target=safeNext==='/discover'?'/discover':'/dashboard';const onboarding=new URL('/onboarding',origin());onboarding.searchParams.set('mode','register');onboarding.searchParams.set('resume','1');onboarding.searchParams.set('next',target);if(purchase&&/^[a-zA-Z0-9_-]{1,100}$/.test(purchase))onboarding.searchParams.set('purchase',purchase);return onboarding.toString();
}
