import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { guard } from '@/lib/guard';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'moderation' });
  if (!user) return error;
  const [reports, recentStories] = await Promise.all([
    prisma.storyReport.findMany({ where: { status: 'OPEN' }, include: { reporter: { select: { id: true, displayName: true, email: true } }, owner: { select: { id: true, displayName: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.userStory.findMany({ where: { expiresAt: { gt: new Date() } }, include: { owner: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  return ok({ reports, recentStories });
}

export async function POST(req: Request) {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'moderation' });
  if (!user) return error;
  const body = await req.json().catch(() => null) as { storyId?: unknown; reportId?: unknown; action?: unknown } | null;
  if (!body || typeof body.action !== 'string' || !['hideStory','deleteStory','resolveReport'].includes(body.action)) return fail('Choose a valid moderation action.');
  if (body.action === 'resolveReport') {
    if (typeof body.reportId !== 'string') return fail('Choose a story report.');
    await prisma.storyReport.update({ where: { id: body.reportId }, data: { status: 'RESOLVED' } });
    await prisma.adminAuditLog.create({ data: { adminId: user.id, action: 'STORY_REPORT_RESOLVED', targetId: body.reportId } });
    return ok({ resolved: true });
  }
  if (typeof body.storyId !== 'string') return fail('Choose a story.');
  const story = await prisma.userStory.findUnique({ where: { id: body.storyId } });
  if (!story) return fail('Story not found.', 404);
  if (body.action === 'hideStory') await prisma.userStory.update({ where: { id: story.id }, data: { visibility: 'HIDDEN' } });
  else {
    await prisma.userStory.delete({ where: { id: story.id } });
    await unlink(path.join(process.cwd(), 'public', story.mediaUrl.replace(/^\//, ''))).catch(() => undefined);
  }
  await prisma.adminAuditLog.create({ data: { adminId: user.id, action: body.action === 'hideStory' ? 'STORY_HIDDEN' : 'STORY_DELETED', targetId: story.id } });
  return ok({ moderated: true });
}
