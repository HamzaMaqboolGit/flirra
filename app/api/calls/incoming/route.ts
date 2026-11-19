import { guard } from "@/lib/guard";
import { ok } from "@/lib/http";
import { liveCallFor, serializeCall } from "@/lib/calls";

export async function GET() {
  const { user, error } = await guard(["MALE", "FEMALE"], { allowSuspended: true });
  if (!user) return error;
  const call = await liveCallFor(user.id);
  return ok({ call: call?.status === "RINGING" && call.recipientId === user.id ? serializeCall(call, user.id) : null });
}
