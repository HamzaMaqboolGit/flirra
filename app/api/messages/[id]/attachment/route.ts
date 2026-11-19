import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { emitTo } from "@/lib/calls";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/utils";

const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  const { user, error } = await guard(undefined, { maintenance: true });
  if (!user) return error;
  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({ where: { id }, select: { memberAId: true, memberBId: true } });
  if (!conversation || (conversation.memberAId !== user.id && conversation.memberBId !== user.id)) return fail("Conversation not found", 404);
  const otherId = conversation.memberAId === user.id ? conversation.memberBId : conversation.memberAId;
  const [block, throttled] = await Promise.all([
    prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: otherId }, { blockerId: otherId, blockedId: user.id }] }, select: { blockerId: true } }),
    rateLimit(`dm:${user.id}:${clientIp(req.headers.get("x-forwarded-for"))}`, 40, 60),
  ]);
  if (block) return fail("Conversation not found", 404);
  if (!throttled) return fail("You’re sending messages too quickly", 429);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Choose an image");
  const extension = extensions[file.type];
  if (!extension) return fail("Use a JPG, PNG, or WebP image");
  if (file.size > 5_000_000) return fail("Images must be 5 MB or smaller");
  const clientId = typeof form.get("clientId") === "string" && /^[0-9a-f-]{36}$/i.test(String(form.get("clientId"))) ? String(form.get("clientId")) : randomUUID();
  const messageId = randomUUID();
  const storageDir = path.join(process.cwd(), "var", "private-message-uploads");
  const filePath = path.join(storageDir, `${messageId}.${extension}`);
  await mkdir(storageDir, { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
  const message = await prisma.$transaction(async tx => {
    const created = await tx.chatMessage.create({ data: { id: messageId, conversationId: id, senderId: user.id, clientId, body: "", attachmentUrl: `/api/messages/attachments/${messageId}`, attachmentPath: filePath, attachmentMime: file.type } });
    await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    await tx.notification.create({ data: { userId: otherId, kind: "DIRECT_MESSAGE", payload: { conversationId: id, messageId, from: user.displayName, attachment: true } } });
    return created;
  });
  emitTo(otherId, "message:new", { conversationId: id, message });
  emitTo(otherId, "notification:new", { id: message.id, kind: "DIRECT_MESSAGE", conversationId: id });
  emitTo(user.id, "message:new", { conversationId: id, message });
  return ok({ message }, 201);
}
