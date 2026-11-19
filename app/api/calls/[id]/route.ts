import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { acceptCall, endCall, liveCallFor, serializeCall } from "@/lib/calls";
import { enqueue, dequeue, type MatchGender } from "@/lib/matchmaking";
import { reportSchema, zodError } from "@/lib/validators";
import { createUserReport } from '@/lib/reports';
import { rateLimit } from '@/lib/redis';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const { id } = await params;
  const call = await prisma.videoCall.findUnique({
    where: { id },
    include: { caller: { include: { profile: true } }, recipient: { include: { profile: true } } },
  });
  if (!call || (call.callerId !== user.id && call.recipientId !== user.id && user.role !== "ADMIN")) return fail("Call not found", 404);
  return ok({ call: serializeCall(call, user.id) });
}

export async function POST(req: Request, { params }: Params) {
  const { user, error } = await guard(undefined, { maintenance: true });
  if (!user) return error;
  const { id } = await params;
  const body = await req.json().catch(() => null) as { action?: string; country?: string; interest?: string; gender?: MatchGender } | null;
  const call = await prisma.videoCall.findUnique({ where: { id }, include: { caller: { include: { profile: true } }, recipient: { include: { profile: true } } } });
  if (!call || (call.callerId !== user.id && call.recipientId !== user.id)) return fail("Call not found", 404);
  try {
    if (body?.action === "accept") {
      const result = await acceptCall(id, user.id);
      return ok({ call: serializeCall(result.call, user.id), waitingForOther: !result.ready });
    }
    if (body?.action === "reject" && call.recipientId === user.id) {
      await endCall(id, "rejected", user.id);
      return ok();
    }
    if (body?.action === "connection_failed") {
      await endCall(id, "connection_failed", user.id);
      return ok();
    }
    if (body?.action === "end") {
      if (call.callerId === user.id) await dequeue(user.id);
      await endCall(id, "hangup", user.id);
      return ok();
    }
    if ((body?.action === "skip" && call.callerId === user.id) || body?.action === "next") {
      await dequeue(user.id);
      await endCall(id, "next_caller", user.id);
      const gender: MatchGender = ["MALE", "FEMALE", "EVERYONE"].includes(body?.gender || "") ? body!.gender! : "EVERYONE";
      await enqueue(user.id, body?.country || call.countryFilter, body?.interest || "", gender);
      return ok({ searching: true });
    }
    return fail("Unknown action");
  } catch (reason) {
    return fail(reason instanceof Error ? reason.message : "Could not update the call");
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { user, error } = await guard();
  if (!user) return error;
  const { id } = await params;
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodError(parsed.error));
  const call = await prisma.videoCall.findUnique({ where: { id } });
  if (!call || (call.callerId !== user.id && call.recipientId !== user.id)) return fail("Call not found", 404);
  if (parsed.data.reportedId !== call.callerId && parsed.data.reportedId !== call.recipientId) return fail("You can report the person on this call");
  if (parsed.data.reportedId === user.id) return fail("You cannot report yourself");
  if (!(await rateLimit(`report:${user.id}`, 5, 3600))) return fail("You have submitted several reports recently. Please wait before submitting another.", 429);
  await createUserReport({reporterId:user.id,reportedId:parsed.data.reportedId,callId:id,reason:parsed.data.reason,details:parsed.data.details,source:'VIDEO_CALL_REPORT'});
  // Reports are routed to moderators for review. Volume alone is not proof of
  // misconduct and must never trigger an automatic suspension.
  return ok({ status: "OPEN", message: "Your report was sent to the moderation team for review." });
}
