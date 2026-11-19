import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { isCountry } from "@/lib/countries";
import { createRingingCall, liveCallFor, serializeCall } from "@/lib/calls";
import { candidate, dequeue, enqueue, type MatchGender } from "@/lib/matchmaking";

export async function GET() {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const calls = await prisma.videoCall.findMany({
    where: { OR: [{ callerId: user.id }, { recipientId: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { caller: { include: { profile: true } }, recipient: { include: { profile: true } } },
  });
  return ok({ calls: calls.map((call) => serializeCall(call, user.id)) });
}

export async function POST(req: Request) {
  const { user, error } = await guard(["MALE", "FEMALE"], { maintenance: true });
  if (!user) return error;
  if (user.accountType === "CREATOR" && user.creatorStatus !== "APPROVED") return fail("Creator applications need approval before using creator call features", 403);
  const body = await req.json().catch(() => null) as { mode?: string; country?: string; recipientId?: string; interest?: string; gender?: MatchGender } | null;
  const country = body?.country || "Worldwide";
  if (country !== "Worldwide" && !isCountry(country)) return fail("Choose a valid country");
  const interest = typeof body?.interest === "string" ? body.interest.trim() : "";
  if (interest.length > 24) return fail("Choose a valid interest");
  const gender: MatchGender = ["MALE", "FEMALE", "EVERYONE"].includes(body?.gender || "") ? body!.gender! : "EVERYONE";
  try {
    if (!(await rateLimit(`queue:${user.id}`, 20, 60))) return fail("Too many match attempts", 429);
    if (body?.mode === "direct") {
      if (!body.recipientId) return fail("Choose someone to call");
      const call = await createRingingCall(user.id, body.recipientId, country);
      return ok({ call: serializeCall(call, user.id) });
    }
    if (!(await candidate(user.id, country, interest, gender))) return fail("No one is available right now. Please try again shortly.", 409);
    await enqueue(user.id, country, interest, gender);
    return ok({ searching: true });
  } catch (reason) {
    return fail(reason instanceof Error ? reason.message : "Could not start matching");
  }
}

export async function DELETE() {
  const { user, error } = await guard(["MALE", "FEMALE"]);
  if (!user) return error;
  await dequeue(user.id);
  const live = await liveCallFor(user.id);
  return ok({ searching: false, live: serializeCall(live, user.id) });
}
