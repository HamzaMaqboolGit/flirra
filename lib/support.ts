import { prisma } from '@/lib/db';

export const SUPPORT_SYSTEM_EMAILS = {
  support: 'support-bot@system.flirra.invalid',
  team: 'team-bot@system.flirra.invalid',
} as const;

export async function ensureOfficialConversations(userId: string) {
  const member = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isGuest: true, status: true } });
  if (!member || member.status === 'DELETED') return;
  const configs = [
    { key: `support:${userId}`, email: SUPPORT_SYSTEM_EMAILS.support, name: 'Flirra Support', welcome: 'Hi! Welcome to Flirra Support 👋\n\nHow can we help you today?\n\nChoose a question below or send us a message. Our support team is here to help.' },
    { key: `team:${userId}`, email: SUPPORT_SYSTEM_EMAILS.team, name: 'Flirra Team', welcome: 'Welcome to Flirra! We’re glad you’re here. Check this conversation for important platform announcements and account updates.' },
  ];
  for (const config of configs) {
    const official = await prisma.user.upsert({
      where: { email: config.email },
      update: {},
      create: { email: config.email, passwordHash: '!system-account-no-login!', displayName: config.name, role: 'ADMIN', accountType: 'USER', emailVerifiedAt: new Date(), profile: { create: { discoverable: false, online: false, bio: 'Official Flirra account' } } },
      select: { id: true },
    });
    const [memberAId, memberBId] = userId < official.id ? [userId, official.id] : [official.id, userId];
    const conversation = await prisma.conversation.upsert({
      where: { memberAId_memberBId: { memberAId, memberBId } },
      create: { memberAId, memberBId, officialKey: config.key },
      update: { officialKey: config.key },
      select: { id: true },
    });
    const setting = config.key.startsWith('team:') ? await prisma.platformSetting.findUnique({ where: { key: 'support-config' }, select: { value: true } }) : null;
    const teamWelcome = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value) ? (setting.value as Record<string, unknown>).teamWelcome : null;
    const welcome = typeof teamWelcome === 'string' && teamWelcome.trim() ? teamWelcome.trim().slice(0, 2000) : config.welcome;
    const clientId = `official-welcome:${config.key}`;
    await prisma.chatMessage.upsert({
      where: { senderId_clientId: { senderId: official.id, clientId } },
      create: { conversationId: conversation.id, senderId: official.id, clientId, body: welcome },
      update: {},
    });
  }
}
