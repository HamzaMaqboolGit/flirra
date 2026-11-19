import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from 'node:crypto';
import path from "node:path";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { profileSchema, zodError } from "@/lib/validators";
import { toClientUser } from "@/lib/auth";
import { setAvailability } from "@/lib/matchmaking";
import { invalidatePublicStats } from "@/lib/public-stats";
import { notifyPublicPresence } from "@/lib/calls";

export async function GET() {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const [photos, followers, following] = await Promise.all([
    prisma.userPhoto.findMany({ where: { userId: user.id }, orderBy: { position: "asc" }, select: { id: true, url: true, position: true } }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
  ]);
  const presenceCutoff = new Date(Date.now() - 90_000);
  const profile = user.profile ? {
    ...user.profile,
    online: Boolean(user.profile.online && user.profile.lastSeenAt && user.profile.lastSeenAt > presenceCutoff),
  } : user.profile;
  return ok({ user: toClientUser(user), profile, photos, social: { followers, following } });
}

export async function PATCH(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const body = await req.json().catch(() => null) as (Record<string, unknown> | null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return fail(zodError(parsed.error));
  if (body?.personalInformation === true && parsed.data.bio.length > 200) return fail("Bio must be 200 characters or fewer.");
  try {
    if (parsed.data.username) {
      const existing = await prisma.user.findUnique({ where: { username: parsed.data.username }, select: { id: true } });
      if (existing && existing.id !== user.id) return fail("That username is already taken.", 409);
    }
    await prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          displayName: parsed.data.displayName,
          ...(parsed.data.username ? { username: parsed.data.username } : {}),
          ...(user.role !== "ADMIN" && parsed.data.role ? { role: parsed.data.role } : {}),
          ...(user.role !== "ADMIN" && parsed.data.dateOfBirth ? { dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`) } : {}),
        },
      });
      let avatarUrl: string | null | undefined;
      if (body?.removeAvatar === true) {
        const nextPhoto = await tx.userPhoto.findFirst({ where: { userId: user.id, ...(user.profile?.avatarUrl ? { url: { not: user.profile.avatarUrl } } : {}) }, orderBy: { position: "asc" }, select: { url: true } });
        avatarUrl = nextPhoto?.url ?? null;
      }
      await tx.userProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, country: parsed.data.country, city: parsed.data.city, bio: parsed.data.bio, interests: parsed.data.interests, discoverable: parsed.data.discoverable, ...(avatarUrl !== undefined ? { avatarUrl } : {}) },
        update: { country: parsed.data.country, city: parsed.data.city, bio: parsed.data.bio, interests: parsed.data.interests, discoverable: parsed.data.discoverable, ...(avatarUrl !== undefined ? { avatarUrl } : {}) },
      });
    });
    // Database changes are already committed. Cache/presence services are
    // best-effort and must not turn a saved profile into a reported failure.
    try {
      invalidatePublicStats();
      if (!parsed.data.discoverable && user.profile?.online) await setAvailability(user.id, false);
      notifyPublicPresence();
    } catch (cause) {
      console.error("[profile/post-save-sync]", cause);
    }
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, include: { profile: true, wallet: true, payoutAccount: true } });
    return ok({ user: fresh ? toClientUser(fresh) : null });
  } catch (cause) {
    console.error("[profile/update]", cause);
    return fail("Unable to save your profile right now. Please try again.", 500);
  }
}

export async function POST(req: Request) {
  const { user, error } = await guard();
  if (!user) return error;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Choose an image");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return fail("Use a JPG, PNG, or WebP image");
  if (!file.size || file.size > 4_000_000) return fail("Image must be under 4MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid) return fail("The uploaded file does not match its image type");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${user.id}-${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(dir, name);
  try { await mkdir(dir, { recursive: true }); await writeFile(filePath, bytes, { flag: 'wx' }); }
  catch (cause) { console.error('[profile:avatar-storage]', cause); return fail("Photo storage is unavailable. Please try again.", 500); }
  const avatarUrl = `/uploads/${name}`;
  try { await prisma.userProfile.update({ where: { userId: user.id }, data: { avatarUrl } }); }
  catch (cause) { await unlink(filePath).catch(() => undefined); console.error('[profile:avatar-save]', cause); return fail("Photo could not be saved to your profile. Please try again.", 500); }
  return ok({ avatarUrl });
}
