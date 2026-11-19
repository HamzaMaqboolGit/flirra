import { guard } from "@/lib/guard";
import { ok } from "@/lib/http";
import { readRtcConfig } from "@/lib/stripe-secrets";

export async function GET() {
  const { user, error } = await guard();
  if (!user) return error;
  const config = await readRtcConfig();
  const stunUrls = config.stunUrls.length ? config.stunUrls : ["stun:stun.l.google.com:19302"];
  const iceServers: RTCIceServer[] = stunUrls.map(urls => ({ urls }));
  if (config.turnUrls.length && config.turnUsername && config.turnCredential) iceServers.push({ urls: config.turnUrls, username: config.turnUsername, credential: config.turnCredential });
  return ok({ iceServers, turnConfigured: Boolean(config.turnUrls.length && config.turnUsername && config.turnCredential), diagnostics: { stunServers: stunUrls.length, turnServers: config.turnUrls.length, warning: config.turnUrls.length && (!config.turnUsername || !config.turnCredential) ? 'TURN URLs are configured but TURN credentials are incomplete.' : undefined } });
}
