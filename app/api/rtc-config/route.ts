import { guard } from "@/lib/guard";
import { ok } from "@/lib/http";

export async function GET() {
  const { user, error } = await guard();
  if (!user) return error;
  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const urls = process.env.TURN_URL?.split(",").map((url) => url.trim()).filter(Boolean) || [];
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (urls.length && username && credential) iceServers.push({ urls, username, credential });
  return ok({ iceServers, turnConfigured: urls.length > 0 && Boolean(username && credential) });
}
