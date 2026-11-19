import 'dotenv/config';
import { prisma } from '../lib/db';
import { hashPassword } from '../lib/auth';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('QA fixtures are disabled in production.');
  const databaseHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : '';
  if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) throw new Error('QA fixtures can only be seeded into a local development database.');
  const password = process.env.QA_MEMBER_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set QA_MEMBER_PASSWORD (at least 8 characters) before seeding.');
  const passwordHash = await hashPassword(password);
  const accounts = [
    { email: 'qa+history-a@velora.test', displayName: 'QA Member One', role: 'MALE' as const, dateOfBirth: new Date('1994-04-12T00:00:00.000Z'), country: 'United States' },
    { email: 'qa+history-b@velora.test', displayName: 'QA Member Two', role: 'FEMALE' as const, dateOfBirth: new Date('1997-09-23T00:00:00.000Z'), country: 'Canada' },
  ];
  const users = [] as { id: string; email: string }[];
  for (const input of accounts) {
    const { country, ...accountData } = input;
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { displayName: accountData.displayName, role: accountData.role, dateOfBirth: accountData.dateOfBirth, passwordHash, status: 'ACTIVE', isGuest: false, emailVerifiedAt: new Date() }, select: { id: true, email: true } })
      : await prisma.user.create({ data: { ...accountData, passwordHash, status: 'ACTIVE', isGuest: false, emailVerifiedAt: new Date(), profile: { create: { country, discoverable: false } }, wallet: { create: { coinBalance: 0 } } }, select: { id: true, email: true } });
    await prisma.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, country, discoverable: false }, update: { country, discoverable: false, online: false } });
    await prisma.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id, coinBalance: 0 }, update: {} });
    users.push(user);
  }
  // Ten real, verified local QA accounts make Discover filters and cards
  // testable end-to-end. They are ordinary users with explicitly marked QA
  // email addresses, never synthetic entries in the discovery response.
  const discoverFixtures = [
    ['Avery Morgan', 'FEMALE', 'United States', 'New York', ['Art', 'Travel'], 'aisha.webp'],
    ['Jordan Lee', 'MALE', 'Canada', 'Toronto', ['Movies', 'Music'], 'jordan.webp'],
    ['Sofia Bennett', 'FEMALE', 'United Kingdom', 'London', ['Travel', 'Photography'], 'sofia.webp'],
    ['Ethan Brooks', 'MALE', 'Australia', 'Sydney', ['Gaming', 'Technology'], 'liam.webp'],
    ['Maya Patel', 'FEMALE', 'India', 'Mumbai', ['Music', 'Food'], 'mei.webp'],
    ['Lucas Martin', 'MALE', 'France', 'Paris', ['Art', 'Movies'], 'mateo.webp'],
    ['Nora Ahmed', 'FEMALE', 'Pakistan', 'Lahore', ['Books', 'Travel'], 'layla.webp'],
    ['Leo Garcia', 'MALE', 'Spain', 'Madrid', ['Sports', 'Music'], 'arjun.webp'],
    ['Amara Okafor', 'FEMALE', 'Nigeria', 'Lagos', ['Food', 'Art'], 'aisha.webp'],
    ['Daniel Kim', 'MALE', 'South Korea', 'Seoul', ['Technology', 'Movies'], 'liam.webp'],
  ] as const;
  const storiesForQa = new Set([0, 2, 4, 6, 8]);
  for (const [index, [displayName, role, country, city, interests, image]] of discoverFixtures.entries()) {
    const email = `qa+discover-${String(index + 1).padStart(2, '0')}@velora.test`;
    const avatarUrl = `/velora-landing/previews/${image}`;
    const dateOfBirth = new Date(Date.UTC(1989 + (index % 10), index % 12, 5 + index));
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { displayName, role, dateOfBirth, passwordHash, status: 'ACTIVE', isGuest: false, emailVerifiedAt: new Date() }, select: { id: true } })
      : await prisma.user.create({ data: { email, displayName, role, dateOfBirth, passwordHash, status: 'ACTIVE', isGuest: false, emailVerifiedAt: new Date(), profile: { create: { country, city, bio: `Local QA member who enjoys ${interests.join(' and ').toLowerCase()}.`, interests: [...interests], avatarUrl, discoverable: true } }, wallet: { create: { coinBalance: 100 } } }, select: { id: true } });
    await prisma.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, country, city, bio: `Local QA member who enjoys ${interests.join(' and ').toLowerCase()}.`, interests: [...interests], avatarUrl, discoverable: true, online: index < 2, lastSeenAt: index < 2 ? new Date() : null }, update: { country, city, bio: `Local QA member who enjoys ${interests.join(' and ').toLowerCase()}.`, interests: [...interests], avatarUrl, discoverable: true, online: index < 2, lastSeenAt: index < 2 ? new Date() : null } });
    await prisma.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id, coinBalance: 100 }, update: {} });
    if (!(await prisma.userPhoto.findFirst({ where: { userId: user.id, url: avatarUrl }, select: { id: true } }))) await prisma.userPhoto.create({ data: { userId: user.id, url: avatarUrl, position: 0 } });
    if (storiesForQa.has(index) && !(await prisma.userStory.findFirst({ where: { ownerId: user.id, mediaUrl: avatarUrl, expiresAt: { gt: new Date() } }, select: { id: true } }))) {
      await prisma.userStory.create({ data: { ownerId: user.id, mediaUrl: avatarUrl, mediaType: 'image', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    }
  }
  const [memberA, memberB] = users;
  const [memberAId, memberBId] = [memberA.id, memberB.id].sort();
  const conversation = await prisma.conversation.upsert({ where: { memberAId_memberBId: { memberAId, memberBId } }, create: { memberAId, memberBId }, update: {} });
  const priorCall = await prisma.videoCall.findFirst({ where: { callerId: memberA.id, recipientId: memberB.id, endReason: 'QA_FIXTURE_COMPLETED' }, select: { id: true } });
  if (!priorCall) await prisma.videoCall.create({ data: { callerId: memberA.id, recipientId: memberB.id, status: 'COMPLETED', startedAt: new Date(Date.now() - 86_400_000), endedAt: new Date(Date.now() - 86_400_000 + 742_000), billableSeconds: 742, coinsCharged: 0, endReason: 'QA_FIXTURE_COMPLETED', createdAt: new Date(Date.now() - 86_400_000) } });
  const missed = await prisma.videoCall.findFirst({ where: { callerId: memberB.id, recipientId: memberA.id, endReason: 'QA_FIXTURE_MISSED' }, select: { id: true } });
  if (!missed) await prisma.videoCall.create({ data: { callerId: memberB.id, recipientId: memberA.id, status: 'REJECTED', endedAt: new Date(Date.now() - 3_600_000), endReason: 'QA_FIXTURE_MISSED', createdAt: new Date(Date.now() - 3_600_000) } });
  const fixtures = [
    { senderId: memberA.id, clientId: 'qa-history-message-a', body: 'Hi, it was nice meeting you on the call.' },
    { senderId: memberB.id, clientId: 'qa-history-message-b', body: 'You too! Let’s chat again soon.' },
  ];
  for (const message of fixtures) if (!(await prisma.chatMessage.findUnique({ where: { senderId_clientId: { senderId: message.senderId, clientId: message.clientId } }, select: { id: true } }))) await prisma.chatMessage.create({ data: { conversationId: conversation.id, ...message, deliveredAt: new Date(), readAt: new Date() } });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@localhost.test' }, select: { id: true, email: true, role: true, status: true, isGuest: true } });
  if (admin?.role === 'ADMIN' && admin.status === 'ACTIVE' && !admin.isGuest) {
    const [adminMemberAId, adminMemberBId] = [admin.id, memberA.id].sort();
    const adminConversation = await prisma.conversation.upsert({ where: { memberAId_memberBId: { memberAId: adminMemberAId, memberBId: adminMemberBId } }, create: { memberAId: adminMemberAId, memberBId: adminMemberBId }, update: {} });
    const adminMessages = [
      { senderId: admin.id, clientId: 'qa-admin-message-admin', body: 'QA check: Messages and History are connected to this admin account.' },
      { senderId: memberA.id, clientId: 'qa-admin-message-member', body: 'Confirmed. This is a seeded local QA conversation.' },
    ];
    for (const message of adminMessages) if (!(await prisma.chatMessage.findUnique({ where: { senderId_clientId: { senderId: message.senderId, clientId: message.clientId } }, select: { id: true } }))) await prisma.chatMessage.create({ data: { conversationId: adminConversation.id, ...message, deliveredAt: new Date(), readAt: new Date() } });
    const adminCompleted = await prisma.videoCall.findFirst({ where: { callerId: admin.id, recipientId: memberA.id, endReason: 'QA_ADMIN_FIXTURE_COMPLETED' }, select: { id: true } });
    if (!adminCompleted) await prisma.videoCall.create({ data: { callerId: admin.id, recipientId: memberA.id, status: 'COMPLETED', startedAt: new Date(Date.now() - 2 * 86_400_000), endedAt: new Date(Date.now() - 2 * 86_400_000 + 386_000), billableSeconds: 386, coinsCharged: 0, endReason: 'QA_ADMIN_FIXTURE_COMPLETED', createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    const adminMissed = await prisma.videoCall.findFirst({ where: { callerId: memberA.id, recipientId: admin.id, endReason: 'QA_ADMIN_FIXTURE_MISSED' }, select: { id: true } });
    if (!adminMissed) await prisma.videoCall.create({ data: { callerId: memberA.id, recipientId: admin.id, status: 'REJECTED', endedAt: new Date(Date.now() - 90 * 60_000), endReason: 'QA_ADMIN_FIXTURE_MISSED', createdAt: new Date(Date.now() - 90 * 60_000) } });
    console.info(`QA conversation and call records attached to ${admin.email}.`);
  } else {
    console.info('admin@localhost.test is not an active admin; admin-specific QA fixtures were skipped.');
  }
  console.info(`QA fixtures ready: ten qa+discover-*@velora.test profiles with photos, five active stories and two briefly online profiles are visible in Discover. QA communication members remain hidden from Discover.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
