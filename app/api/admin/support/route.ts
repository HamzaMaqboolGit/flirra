import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { emitTo } from '@/lib/calls';

export async function GET() {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'support' });
  if (!user) return error;
  const [faqs, requests, agents, admins, total, resolved, waiting, ratings, responseRows, resolutionRows] = await Promise.all([
    prisma.supportFAQ.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.supportRequest.findMany({ where: { status: { in: ['WAITING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] } }, include: { user: { select: { id: true, displayName: true, email: true, emailVerifiedAt: true, profile: { select: { avatarUrl: true, country: true } } } }, assignedAgent: { select: { id: true, displayName: true } }, conversation: { include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } } }, notes: { orderBy: { createdAt: 'asc' }, include: { agent: { select: { displayName: true } } } }, rating: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], take: 150 }),
    prisma.supportAgent.findMany({ include: { user: { select: { id: true, displayName: true, email: true } } }, orderBy: { updatedAt: 'desc' } }),
    prisma.user.findMany({ where:{role:'ADMIN',status:'ACTIVE',email:{notIn:['support-bot@system.flirra.invalid','team-bot@system.flirra.invalid']}},select:{id:true,displayName:true,email:true},orderBy:{displayName:'asc'},take:200 }),
    prisma.supportRequest.count(), prisma.supportRequest.count({ where: { status: 'RESOLVED' } }),
    prisma.supportRequest.count({ where: { status: 'WAITING' } }),
    prisma.supportRating.aggregate({ _avg: { stars: true }, _count: { _all: true } }),
    prisma.supportRequest.findMany({ where: { assignedAt: { not: null } }, select: { createdAt: true, assignedAt: true }, take: 500 }),
    prisma.supportRequest.findMany({ where: { resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, take: 500 }),
  ]);
  const avg = (rows: Array<{ createdAt: Date; assignedAt?: Date | null; resolvedAt?: Date | null }>, end: 'assignedAt'|'resolvedAt') => { const diffs = rows.map(row => row[end] ? row[end]!.getTime()-row.createdAt.getTime() : -1).filter(v => v >= 0); return diffs.length ? Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length/60000) : null; };
  const configRow = await prisma.platformSetting.findUnique({ where: { key: 'support-config' }, select: { value: true } });
  return ok({ currentAgentId:user.id, faqs, requests, agents, admins, settings: configRow?.value || {}, metrics: { total, active: requests.filter(row => ['ASSIGNED','IN_PROGRESS'].includes(row.status)).length, waiting, availableAgents: agents.filter(agent => agent.availability === 'ONLINE').length, averageFirstResponseMinutes: avg(responseRows,'assignedAt'), averageResolutionMinutes: avg(resolutionRows,'resolvedAt'), resolved, averageRating: ratings._avg.stars, ratingCount: ratings._count._all } });
}

const schema = z.object({ action: z.string(), id: z.string().optional(), question: z.string().trim().max(200).optional(), answer: z.string().trim().max(4000).optional(), category: z.string().trim().max(80).optional(), keywords: z.array(z.string().trim().max(40)).max(20).nullable().optional(), followUps: z.array(z.string().max(200)).max(10).nullable().optional(), sortOrder: z.number().int().min(0).max(10000).optional(), enabled: z.boolean().optional(), escalate: z.boolean().optional(), userId: z.string().optional(), availability: z.enum(['ONLINE','BUSY','AWAY','OFFLINE']).optional(), maxChats: z.number().int().min(1).max(20).optional(), body: z.string().trim().max(2000).optional(), requestId: z.string().optional(), announcement: z.string().trim().max(2000).optional(), teamWelcome: z.string().trim().max(2000).optional(), liveEnabled: z.boolean().optional(), automaticAssignment: z.boolean().optional(), queueCapacity: z.number().int().min(1).max(10000).optional(), operatingHours: z.string().max(1000).optional() });

export async function POST(req: Request) {
  const { user: admin, error } = await guard(['ADMIN'], { maintenance: true, permission: 'support' });
  if (!admin) return error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid support action.');
  const d = parsed.data;
  if (d.action === 'faq-save') {
    if (!d.question || !d.answer) return fail('Enter a question and answer.');
    const data = { question:d.question, answer:d.answer, category:d.category||'General', keywords:d.keywords||[], followUps:d.followUps||[], sortOrder:d.sortOrder||0, enabled:d.enabled??true, escalate:d.escalate??false };
    const faq = d.id ? await prisma.supportFAQ.update({ where: { id:d.id }, data }) : await prisma.supportFAQ.create({ data });
    return ok({ faq });
  }
  if (d.action === 'faq-delete' && d.id) { await prisma.supportFAQ.delete({ where: { id:d.id } }); return ok(); }
  if(d.action==='announcement') { if(!d.announcement)return fail('Write an announcement.');const team=await prisma.user.findUnique({where:{email:'team-bot@system.flirra.invalid'},select:{id:true}});if(!team)return fail('Team account is unavailable.',503);const conversations=await prisma.conversation.findMany({where:{officialKey:{startsWith:'team:'}},select:{id:true,officialKey:true,memberBId:true,memberAId:true}});for(const conversation of conversations){const recipientId=conversation.officialKey?.slice(5)||conversation.memberAId;const message=await prisma.chatMessage.create({data:{conversationId:conversation.id,senderId:team.id,body:d.announcement}});await prisma.conversation.update({where:{id:conversation.id},data:{updatedAt:new Date()}});emitTo(recipientId,'message:new',{conversationId:conversation.id,message});emitTo(recipientId,'notification:new',{kind:'TEAM_ANNOUNCEMENT',conversationId:conversation.id})}await prisma.adminAuditLog.create({data:{adminId:admin.id,action:'SUPPORT_ANNOUNCEMENT',metadata:{recipients:conversations.length}}});return ok({sent:conversations.length}); }
  if (d.action === 'settings') {
    const value = { teamWelcome:d.teamWelcome, liveEnabled:d.liveEnabled??true, automaticAssignment:d.automaticAssignment??true, queueCapacity:d.queueCapacity??500, operatingHours:d.operatingHours||'', updatedBy:admin.id };
    await prisma.platformSetting.upsert({ where:{key:'support-config'}, create:{key:'support-config',value}, update:{value} }); return ok({settings:value});
  }
  if (d.action === 'agent-save' && d.userId) {
    const target = await prisma.user.findFirst({ where:{id:d.userId,role:'ADMIN'},select:{id:true} }); if(!target)return fail('Support agents must be administrator accounts.',404);
    const agent=await prisma.supportAgent.upsert({where:{userId:d.userId},create:{userId:d.userId,availability:d.availability||'OFFLINE',maxChats:d.maxChats||3},update:{availability:d.availability||'OFFLINE',maxChats:d.maxChats||3}});
    if(agent.availability==='ONLINE') await assignWaiting(agent.userId,agent.maxChats);
    return ok({agent});
  }
  if (d.action === 'agent-remove' && d.userId) { await prisma.supportAgent.deleteMany({where:{userId:d.userId}}); return ok(); }
  if (!d.requestId) return fail('Support request is required.');
  const request=await prisma.supportRequest.findUnique({where:{id:d.requestId},include:{conversation:true}}); if(!request)return fail('Support request not found.',404);
  if(d.action==='claim') {
    const agent=await prisma.supportAgent.findUnique({where:{userId:admin.id}}); if(!agent||agent.availability!=='ONLINE')return fail('Set your support availability to Online first.',403);
    const active=await prisma.supportRequest.count({where:{assignedAgentId:admin.id,status:{in:['ASSIGNED','IN_PROGRESS']}}});if(active>=agent.maxChats)return fail('Your active chat limit has been reached.',409);
    const claim=await prisma.supportRequest.updateMany({where:{id:request.id,status:'WAITING',assignedAgentId:null},data:{status:'ASSIGNED',assignedAgentId:admin.id,assignedAt:new Date()}});if(!claim.count)return fail('Another agent already accepted this request.',409);
    emitTo(request.userId,'support:queue',{requestId:request.id,status:'ASSIGNED'});return ok();
  }
  if(d.action==='reply') {
    if(!d.body)return fail('Enter a message.');if(request.assignedAgentId!==admin.id)return fail('Only the assigned agent can reply.',403);
    const official=await prisma.user.findUnique({where:{email:'support-bot@system.flirra.invalid'},select:{id:true}});if(!official)return fail('Support account is unavailable.',503);
    const message=await prisma.chatMessage.create({data:{conversationId:request.conversationId,senderId:official.id,body:d.body}});await prisma.supportRequest.update({where:{id:request.id},data:{status:'IN_PROGRESS'}});await prisma.conversation.update({where:{id:request.conversationId},data:{updatedAt:new Date()}});emitTo(request.userId,'message:new',{conversationId:request.conversationId,message});return ok({message});
  }
  if(d.action==='note') { if(!d.body)return fail('Enter an internal note.');if(request.assignedAgentId!==admin.id)return fail('Only the assigned agent can add notes.',403);const note=await prisma.supportInternalNote.create({data:{requestId:request.id,agentId:admin.id,body:d.body}});return ok({note}); }
  if(d.action==='resolve') { await prisma.supportRequest.update({where:{id:request.id},data:{status:'RESOLVED',resolvedAt:new Date()}});emitTo(request.userId,'support:queue',{requestId:request.id,status:'RESOLVED'});return ok(); }
  if(d.action==='reopen') { await prisma.supportRequest.update({where:{id:request.id},data:{status:'IN_PROGRESS',resolvedAt:null,closedAt:null}});emitTo(request.userId,'support:queue',{requestId:request.id,status:'IN_PROGRESS'});return ok(); }
  if(d.action==='close') { await prisma.supportRequest.update({where:{id:request.id},data:{status:'CLOSED',closedAt:new Date()}});emitTo(request.userId,'support:queue',{requestId:request.id,status:'CLOSED'});return ok(); }
  return fail('Unknown support action.');
}

async function assignWaiting(agentId:string,maxChats:number){while((await prisma.supportRequest.count({where:{assignedAgentId:agentId,status:{in:['ASSIGNED','IN_PROGRESS']}}}))<maxChats){const row=await prisma.supportRequest.findFirst({where:{status:'WAITING',assignedAgentId:null},orderBy:[{priority:'desc'},{createdAt:'asc'}]});if(!row)break;const updated=await prisma.supportRequest.updateMany({where:{id:row.id,status:'WAITING',assignedAgentId:null},data:{status:'ASSIGNED',assignedAgentId:agentId,assignedAt:new Date()}});if(updated.count)emitTo(row.userId,'support:queue',{requestId:row.id,status:'ASSIGNED'})}}
