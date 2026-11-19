import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { rateLimit } from '@/lib/redis';
import { clientIp } from '@/lib/utils';
import { ensureOfficialConversations } from '@/lib/support';
import { emitTo } from '@/lib/calls';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('faq'), faqId: z.string().min(1) }),
  z.object({ action: z.literal('agent'), priority: z.number().int().min(0).max(10).default(0) }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('rate'), requestId: z.string().min(1), stars: z.number().int().min(1).max(5), feedback: z.string().trim().max(1000).optional() }),
]);

export async function GET() {
  const { user, error } = await guard(['MALE', 'FEMALE']);
  if (!user) return error;
  await ensureOfficialConversations(user.id);
  const [faqs, active, recent] = await Promise.all([
    prisma.supportFAQ.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, question: true, answer: true, category: true, followUps: true, escalate: true } }),
    prisma.supportRequest.findFirst({ where: { userId: user.id, status: { in: ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] } }, include: { assignedAgent: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true } } } } } }),
    prisma.supportRequest.findFirst({ where: { userId: user.id, status: 'RESOLVED', rating: null }, orderBy: { resolvedAt: 'desc' }, select: { id: true } }),
  ]);
  if (!active) return ok({ faqs, request: null, ratingRequestId: recent?.id || null });
  const before = await prisma.supportRequest.count({ where: { status: 'WAITING', OR: [{ priority: { gt: active.priority } }, { priority: active.priority, createdAt: { lt: active.createdAt } }] } });
  const completed = await prisma.supportRequest.findMany({ where: { assignedAt: { not: null } }, select: { createdAt: true, assignedAt: true }, orderBy: { createdAt: 'desc' }, take: 30 });
  const averages = completed.map(row => row.assignedAt!.getTime() - row.createdAt.getTime()).filter(value => value >= 0);
  const avgMs = averages.length ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length) : null;
  const etaMinutes = avgMs === null ? null : Math.max(1, Math.ceil((before + 1) * avgMs / 60_000));
  return ok({ faqs, ratingRequestId: recent?.id || null, request: { id: active.id, status: active.status, position: active.status === 'WAITING' ? before + 1 : 0, etaMinutes, agent: active.assignedAgent ? { id: active.assignedAgent.id, name: active.assignedAgent.displayName, avatarUrl: active.assignedAgent.profile?.avatarUrl || null } : null } });
}

export async function POST(req: Request) {
  const { user, error } = await guard(['MALE', 'FEMALE'], { maintenance: true });
  if (!user) return error;
  if (!(await rateLimit(`support:${user.id}:${clientIp(req.headers.get('x-forwarded-for'))}`, 30, 60))) return fail('Please wait before sending another support request.', 429);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid support request.');
  await ensureOfficialConversations(user.id);
  const support = await prisma.user.findUnique({ where: { email: 'support-bot@system.flirra.invalid' }, select: { id: true } });
  const key = `support:${user.id}`;
  const conversation = support ? await prisma.conversation.findUnique({ where: { officialKey: key }, select: { id: true } }) : null;
  if (!conversation) return fail('Support conversation is not available.', 503);
  const data = parsed.data;
  if (data.action === 'faq') {
    const faq = await prisma.supportFAQ.findFirst({ where: { id: data.faqId, enabled: true } });
    if (!faq) return fail('That help topic is no longer available.', 404);
    const botId = support!.id;
    const question = await prisma.chatMessage.create({ data: { conversationId: conversation.id, senderId: user.id, body: faq.question } });
    const answer = await prisma.chatMessage.create({ data: { conversationId: conversation.id, senderId: botId, body: faq.answer } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    emitTo(user.id, 'message:new', { conversationId: conversation.id, message: question });
    emitTo(user.id, 'message:new', { conversationId: conversation.id, message: answer });
    if (faq.escalate) return ok({ escalate: true, questionId: faq.id });
    return ok({ sent: true });
  }
  if (data.action === 'agent') {
    const supportSetting=await prisma.platformSetting.findUnique({where:{key:'support-config'},select:{value:true}});const config=supportSetting?.value&&typeof supportSetting.value==='object'&&!Array.isArray(supportSetting.value)?supportSetting.value as Record<string,unknown>:{};if(config.liveEnabled===false)return fail('Live support is currently offline. Please leave us a message here.',503);const queueCapacity=typeof config.queueCapacity==='number'?Math.max(1,Math.min(10000,config.queueCapacity)):500;if(await prisma.supportRequest.count({where:{status:'WAITING'}})>=queueCapacity)return fail('The support queue is full right now. Please try again later.',503);
    const created = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const previous = await tx.supportRequest.findFirst({ where: { userId: user.id, status: { in: ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] } } });
      if (previous) return previous;
      const online = config.automaticAssignment===false?[]:await tx.supportAgent.findMany({ where: { availability: 'ONLINE' }, include: { user: { select: { id: true } } }, orderBy: { updatedAt: 'asc' } });
      let agentId: string | null = null;
      for (const candidate of online) {
        const accepted = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "SupportAgent" WHERE "userId" = ${candidate.userId} FOR UPDATE`;
        if (!accepted.length) continue;
        const count = await tx.supportRequest.count({ where: { assignedAgentId: candidate.userId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } });
        if (count < candidate.maxChats) { agentId = candidate.userId; break; }
      }
      return tx.supportRequest.create({ data: { userId: user.id, conversationId: conversation.id, priority: data.priority, status: agentId ? 'ASSIGNED' : 'WAITING', assignedAgentId: agentId, assignedAt: agentId ? new Date() : null } });
    });
    if (created.assignedAgentId) emitTo(created.assignedAgentId, 'support:request', { requestId: created.id });
    emitTo(user.id, 'support:queue', { requestId: created.id, status: created.status });
    return ok({ requestId: created.id, status: created.status }, created.status === 'WAITING' ? 202 : 201);
  }
  if (data.action === 'cancel') {
    const result = await prisma.supportRequest.updateMany({ where: { userId: user.id, status: 'WAITING' }, data: { status: 'CANCELLED', closedAt: new Date() } });
    return ok({ cancelled: Boolean(result.count) });
  }
  const request = await prisma.supportRequest.findFirst({ where: { id: data.requestId, userId: user.id, status: 'RESOLVED' } });
  if (!request) return fail('Resolved support conversation not found.', 404);
  await prisma.supportRating.upsert({ where: { requestId: request.id }, create: { requestId: request.id, userId: user.id, stars: data.stars, feedback: data.feedback }, update: { stars: data.stars, feedback: data.feedback } });
  return ok({ saved: true });
}
