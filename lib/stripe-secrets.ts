import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { prisma } from './db';

const KEYS = ['stripe.secretKey', 'stripe.webhookSecret', 'stripe.connectSecret', 'stripe.publishableKey', 'paypal.clientSecret', 'paypal.webhookId', 'adapty.apiKey', 'adapty.webhookSecret', 'auth.google.clientSecret', 'auth.apple.privateKey', 'rtc.turnCredential', 'translation.apiKey'] as const;
type SecretKey = typeof KEYS[number];

function encryptionKey() {
  const master = process.env.STRIPE_SETTINGS_ENCRYPTION_KEY;
  if (!master || master.length < 32) throw new Error('Set STRIPE_SETTINGS_ENCRYPTION_KEY to at least 32 characters before saving Stripe credentials.');
  return createHash('sha256').update(master).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

function decrypt(value: string) {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Stored Stripe credentials have an unsupported format.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export async function readStripeCredentials() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...KEYS, 'stripe.accountId'] } } });
  const stored = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const read = (key: SecretKey, env: string) => {
    const value = stored[key];
    if (typeof value === 'string' && value.startsWith('v1:')) return decrypt(value);
    return process.env[env] || '';
  };
  return {
    accountId: typeof stored['stripe.accountId'] === 'string' ? stored['stripe.accountId'] : process.env.STRIPE_ACCOUNT_ID || '',
    secretKey: read('stripe.secretKey', 'STRIPE_SECRET_KEY'),
    webhookSecret: read('stripe.webhookSecret', 'STRIPE_WEBHOOK_SECRET'),
    connectSecret: read('stripe.connectSecret', 'STRIPE_CONNECT_SECRET_KEY'),
    publishableKey: read('stripe.publishableKey', 'STRIPE_PUBLISHABLE_KEY'),
  };
}

/** Presence-only status for admin UI. It never decrypts or returns secret values. */
export async function stripeCredentialStatus() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...KEYS, 'stripe.accountId'] } }, select: { key: true, value: true } });
  const stored = new Map(rows.map(row => [row.key, row.value]));
  const configured = (key: SecretKey, env: string) => Boolean(
    typeof stored.get(key) === 'string' && String(stored.get(key)).length > 0 || process.env[env],
  );
  return {
    secretKey: configured('stripe.secretKey', 'STRIPE_SECRET_KEY'),
    webhookSecret: configured('stripe.webhookSecret', 'STRIPE_WEBHOOK_SECRET'),
    connectSecret: configured('stripe.connectSecret', 'STRIPE_CONNECT_SECRET_KEY'),
    publishableKey: configured('stripe.publishableKey', 'STRIPE_PUBLISHABLE_KEY'),
  };
}

export async function readStripeFlags() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['stripe.paymentsEnabled', 'stripe.connectEnabled', 'stripe.liveApproved'] } } });
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return {
    paymentsEnabled: typeof values['stripe.paymentsEnabled'] === 'boolean' ? values['stripe.paymentsEnabled'] : process.env.PAYMENTS_ENABLED === 'true',
    connectEnabled: typeof values['stripe.connectEnabled'] === 'boolean' ? values['stripe.connectEnabled'] : process.env.STRIPE_CONNECT_ENABLED === 'true',
    liveApproved: typeof values['stripe.liveApproved'] === 'boolean' ? values['stripe.liveApproved'] : false,
  };
}

export async function saveStripeSettings(input: { accountId?: string; secretKey?: string; webhookSecret?: string; connectSecret?: string; publishableKey?: string; paymentsEnabled: boolean; connectEnabled: boolean }, adminId?: string) {
  const values: Record<string, unknown> = {
    'stripe.paymentsEnabled': input.paymentsEnabled,
    'stripe.connectEnabled': input.connectEnabled,
  };
  if (input.secretKey || input.publishableKey) values['stripe.liveApproved'] = false;
  if (input.accountId !== undefined) values['stripe.accountId'] = input.accountId.trim();
  const secretMap: Array<[SecretKey, string | undefined]> = [
    ['stripe.secretKey', input.secretKey], ['stripe.webhookSecret', input.webhookSecret],
    ['stripe.connectSecret', input.connectSecret], ['stripe.publishableKey', input.publishableKey],
  ];
  for (const [key, value] of secretMap) if (value) values[key] = encrypt(value);
  await prisma.$transaction(async tx => {
    for (const [key, value] of Object.entries(values)) await tx.platformSetting.upsert({
      where: { key }, create: { key, value: value as never }, update: { value: value as never },
    });
    if (adminId) await tx.adminAuditLog.create({ data: { adminId, action: 'STRIPE_SETTINGS_UPDATED', metadata: { paymentsEnabled: input.paymentsEnabled, connectEnabled: input.connectEnabled, updatedKeys: secretMap.filter(([, value]) => Boolean(value)).map(([key]) => key) } } });
  });
}

export async function approveStripeLive(adminId?: string) {
  await prisma.$transaction(async tx => {
    await tx.platformSetting.upsert({ where: { key: 'stripe.liveApproved' }, create: { key: 'stripe.liveApproved', value: true }, update: { value: true } });
    if (adminId) await tx.adminAuditLog.create({ data: { adminId, action: 'STRIPE_LIVE_APPROVED', metadata: { source: 'verified_api_connection' } } });
  });
}

export async function readProviderSecret(key: 'paypal.clientSecret'|'paypal.webhookId'|'adapty.apiKey'|'adapty.webhookSecret'|'translation.apiKey') {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  const value = row?.value;
  if (typeof value === 'string' && value.startsWith('v1:')) return decrypt(value);
  return '';
}

export async function readAuthSecret(key: 'auth.google.clientSecret'|'auth.apple.privateKey') {
  const row=await prisma.platformSetting.findUnique({where:{key}});const value=row?.value;
  if(typeof value==='string'&&value.startsWith('v1:'))return decrypt(value);
  if (key === 'auth.google.clientSecret') return process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_CLIENT_SECRET || '';
  return '';
}

export async function authSecretStatus(){
  const rows=await prisma.platformSetting.findMany({where:{key:{in:['auth.google.clientSecret','auth.apple.privateKey']}},select:{key:true,value:true}});
  const values=new Map(rows.map(row=>[row.key,row.value]));
  return {google:Boolean(values.get('auth.google.clientSecret') || process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_CLIENT_SECRET),apple:Boolean(values.get('auth.apple.privateKey'))};
}

export async function saveAuthSettings(input:{google:{enabled:boolean;clientId:string;clientSecret?:string};apple:{enabled:boolean;clientId:string;teamId:string;keyId:string;privateKey?:string}},adminId:string){
  const values:Record<string,unknown>={'auth.google.enabled':input.google.enabled,'auth.google.clientId':input.google.clientId.trim(),'auth.apple.enabled':input.apple.enabled,'auth.apple.clientId':input.apple.clientId.trim(),'auth.apple.teamId':input.apple.teamId.trim(),'auth.apple.keyId':input.apple.keyId.trim()};
  if(input.google.clientSecret)values['auth.google.clientSecret']=encrypt(input.google.clientSecret);
  if(input.apple.privateKey)values['auth.apple.privateKey']=encrypt(input.apple.privateKey);
  await prisma.$transaction(async tx=>{for(const [key,value] of Object.entries(values))await tx.platformSetting.upsert({where:{key},create:{key,value:value as never},update:{value:value as never}});await tx.adminAuditLog.create({data:{adminId,action:'AUTH_PROVIDER_SETTINGS_UPDATED',metadata:{googleEnabled:input.google.enabled,appleEnabled:input.apple.enabled,updatedSecrets:[...(input.google.clientSecret?['google client secret']:[]),...(input.apple.privateKey?['apple private key']:[])]}}})});
}

export async function readAuthProviderFlags(provider:'google'|'apple'){
 const keys=provider==='google'?['auth.google.enabled','auth.google.clientId']:['auth.apple.enabled','auth.apple.clientId','auth.apple.teamId','auth.apple.keyId'];
 const rows=await prisma.platformSetting.findMany({where:{key:{in:keys}},select:{key:true,value:true}});
 const values=Object.fromEntries(rows.map(row=>[row.key,row.value]));
 if (provider === 'google') {
   const clientId = String(values['auth.google.clientId'] || process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID || '');
   const envConfigured = Boolean((process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID) && (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_CLIENT_SECRET));
   const enabled = values['auth.google.enabled'] === true || (values['auth.google.enabled'] === undefined && (process.env.GOOGLE_OAUTH_ENABLED === 'true' || envConfigured));
   return {'auth.google.enabled': enabled, 'auth.google.clientId': clientId};
 }
 return values;
}

export async function providerSecretStatus(keys: Array<'paypal.clientSecret'|'paypal.webhookId'|'adapty.apiKey'|'adapty.webhookSecret'|'translation.apiKey'>) {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  return Object.fromEntries(keys.map(key => [key, rows.some(row => row.key === key && typeof row.value === 'string' && String(row.value).startsWith('v1:'))]));
}

export async function saveProviderSettings(input: { provider: 'paypal'|'adapty'|'translation'; values: Record<string, unknown>; secrets: Record<string, string|undefined>; action: string }, adminId: string) {
  const values = { ...input.values };
  for (const [key, value] of Object.entries(input.secrets)) if (value) values[key] = encrypt(value);
  await prisma.$transaction(async tx => {
    for (const [key, value] of Object.entries(values)) await tx.platformSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
    await tx.adminAuditLog.create({ data: { adminId, action: input.action, metadata: { provider: input.provider, updatedKeys: Object.keys(input.secrets).filter(key => Boolean(input.secrets[key])) } } });
  });
}

export async function readProviderFlags(provider: 'paypal'|'adapty'|'translation') {
  const keys = provider === 'paypal' ? ['paypal.enabled','paypal.environment','paypal.clientId'] : provider === 'adapty' ? ['adapty.enabled','adapty.publicKey'] : ['translation.enabled','translation.url'];
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

export async function readRtcConfig() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['rtc.stunUrls', 'rtc.turnUrls', 'rtc.turnUsername', 'rtc.turnCredential'] } }, select: { key: true, value: true } });
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const read = (key: string, env: string) => { const value = values[key]; if (typeof value === 'string' && value.startsWith('v1:')) return decrypt(value); return typeof value === 'string' ? value : process.env[env] || ''; };
  const parseUrls = (value: string) => value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean).slice(0, 20);
  return { stunUrls: parseUrls(read('rtc.stunUrls', 'TURN_URL')), turnUrls: parseUrls(read('rtc.turnUrls', 'TURN_URL')), turnUsername: read('rtc.turnUsername', 'TURN_USERNAME'), turnCredential: read('rtc.turnCredential', 'TURN_CREDENTIAL') };
}

export async function rtcConfigStatus() {
  const config = await readRtcConfig();
  return { stunUrls: config.stunUrls, turnUrls: config.turnUrls, turnUsername: config.turnUsername ? 'configured' : '', turnCredential: config.turnCredential ? 'configured' : '', turnConfigured: Boolean(config.turnUrls.length && config.turnUsername && config.turnCredential) };
}

export async function saveRtcConfig(input: { stunUrls: string[]; turnUrls: string[]; turnUsername: string; turnCredential?: string }, adminId?: string) {
  const values: Record<string, unknown> = { 'rtc.stunUrls': input.stunUrls.join('\n'), 'rtc.turnUrls': input.turnUrls.join('\n'), 'rtc.turnUsername': input.turnUsername.trim() };
  if (input.turnCredential) values['rtc.turnCredential'] = encrypt(input.turnCredential);
  await prisma.$transaction(async tx => {
    for (const [key, value] of Object.entries(values)) await tx.platformSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
    if (adminId) await tx.adminAuditLog.create({ data: { adminId, action: 'RTC_SETTINGS_UPDATED', metadata: { stunCount: input.stunUrls.length, turnCount: input.turnUrls.length, credentialReplaced: Boolean(input.turnCredential) } } });
  });
}
