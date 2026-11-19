import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export async function POST(req: Request) {
  const viewer = await currentUser();
  if (!viewer) return fail('Sign in to report a story.', 401);
  const body = await req.json().catch(() => null) as { storyId?: unknown; reason?: unknown; details?: unknown } | null;
  if (!body || typeof body.storyId !== 'string' || body.storyId.length > 100 || typeof body.reason !== 'string' || body.reason.length > 80) return fail('Invalid story report.');
  const story = await prisma.userStory.findFirst({ where: { id: body.storyId, expiresAt: { gt: new Date() }, visibility: 'PUBLIC' } });
  if (!story || story.ownerId === viewer.id) return fail('This story cannot be reported.', 404);
  try {
    await prisma.storyReport.create({ data: { storyId: story.id, reporterId: viewer.id, ownerId: story.ownerId, reason: body.reason, details: typeof body.details === 'string' ? body.details.slice(0, 500) : null } });
    return ok({ reported: true }, 201);
  } catch {
    return fail('You have already reported this story.', 409);
  }
}
