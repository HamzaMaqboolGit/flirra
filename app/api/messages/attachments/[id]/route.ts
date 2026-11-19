import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { fail } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const { id } = await params;
  const message = await prisma.chatMessage.findUnique({ where: { id }, select: { senderId: true, attachmentPath: true, attachmentMime: true, conversation: { select: { memberAId: true, memberBId: true } } } });
  if (!message?.attachmentPath || !message.attachmentMime || (message.conversation.memberAId !== user.id && message.conversation.memberBId !== user.id)) return fail("Attachment not found", 404);
  const otherId = message.senderId === user.id ? message.conversation.memberAId === user.id ? message.conversation.memberBId : message.conversation.memberAId : message.senderId;
  const blocked = await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: otherId }, { blockerId: otherId, blockedId: user.id }] }, select: { blockerId: true } });
  if (blocked) return fail("Attachment not found", 404);
  try {
    const content = await readFile(message.attachmentPath);
    return new Response(content, { headers: { "Content-Type": message.attachmentMime, "Content-Length": String(content.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return fail("Attachment not found", 404);
  }
}
