import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const { id } = await params;
  const call = await prisma.videoCall.findUnique({ where: { id }, select: { callerId: true, recipientId: true } });
  if (!call || (call.callerId !== user.id && call.recipientId !== user.id)) return fail("Call not found", 404);
  await prisma.videoCall.update({ where: { id }, data: call.callerId === user.id ? { hiddenForCaller: true } : { hiddenForRecipient: true } });
  return ok({ removed: true });
}
