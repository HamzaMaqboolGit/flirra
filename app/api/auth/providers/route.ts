import { ok } from '@/lib/http';
import { authSecretStatus, readAuthProviderFlags } from '@/lib/stripe-secrets';

export async function GET(){try{const [google,apple,secrets]=await Promise.all([readAuthProviderFlags('google'),readAuthProviderFlags('apple'),authSecretStatus()]);return ok({google:google['auth.google.enabled']===true&&Boolean(google['auth.google.clientId'])&&secrets.google,apple:apple['auth.apple.enabled']===true&&Boolean(apple['auth.apple.clientId']&&apple['auth.apple.teamId']&&apple['auth.apple.keyId'])&&secrets.apple})}catch{return ok({google:false,apple:false})}}
