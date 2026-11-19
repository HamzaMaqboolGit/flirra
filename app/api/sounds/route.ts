import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { effectiveSoundConfig, normalizeUserSoundPreferences } from "@/lib/sounds";

const schema = z.object({ muted: z.record(z.string(), z.boolean()), volume: z.number().min(0).max(1), browserNotifications: z.boolean() }).strict();

export async function GET() {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const { catalog, preferences } = await effectiveSoundConfig(user.id);
  return ok({ catalog, preferences });
}

export async function PATCH(request: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  if (user.isGuest) return fail("Create a member account to save sound preferences.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid sound preferences.");
  const { catalog } = await effectiveSoundConfig(user.id);
  const requested = normalizeUserSoundPreferences(parsed.data);
  const merged = { ...requested, muted: catalog.allowUserPreferences ? requested.muted : {} };
  const current = await prisma.userProfile.findUnique({ where: { userId: user.id }, select: { accountSettings: true } });
  const account = current?.accountSettings && typeof current.accountSettings === "object" ? current.accountSettings as Record<string, unknown> : {};
  await prisma.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, accountSettings: { ...account, soundPreferences: merged } }, update: { accountSettings: { ...account, soundPreferences: merged } } });
  return ok({ preferences: merged, catalog });
}
