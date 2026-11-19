import { z } from "zod";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { getSoundCatalog, saveSoundCatalog } from "@/lib/sounds";
import { emitTo } from "@/lib/calls";
import { prisma } from "@/lib/db";

const item = z.object({ enabled: z.boolean(), url: z.string().max(300), volume: z.number().min(0).max(1), isDefault: z.boolean() }).strict();
const schema = z.object({ masterVolume: z.number().min(0).max(1), allowUserPreferences: z.boolean(), sounds: z.record(z.string(), item) }).strict();

export async function GET() {
  const { user, error } = await guard(["ADMIN"], { allowSuspended: true });
  if (!user) return error;
  return ok({ catalog: await getSoundCatalog() });
}

export async function PUT(request: Request) {
  const { user, error } = await guard(["ADMIN"], { allowSuspended: true });
  if (!user) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid sound configuration.");
  const known = await getSoundCatalog();
  if (Object.keys(parsed.data.sounds).length !== 10 || Object.keys(known.sounds).some(id => !parsed.data.sounds[id])) return fail("Every supported sound event must have a configuration.");
  const catalog = await saveSoundCatalog(parsed.data as typeof known, user.id);
  const users = await prisma.user.findMany({ where: { status: "ACTIVE", role: { in: ["MALE", "FEMALE"] } }, select: { id: true } });
  for (const recipient of users) emitTo(recipient.id, "sound:config-updated", {});
  return ok({ catalog });
}
