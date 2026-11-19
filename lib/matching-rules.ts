export type CallAccount = {
  role: string;
  accountType: string;
  creatorStatus: string;
  status: string;
  isGuest: boolean;
  emailVerified: boolean;
};

export function canInitiateCall(user: CallAccount) {
  return ['MALE', 'FEMALE'].includes(user.role) && user.status === 'ACTIVE';
}

export function canReceiveCall(user: CallAccount & { online: boolean; discoverable: boolean; lastSeenAt: Date | null }, now = new Date()) {
  return ['MALE', 'FEMALE'].includes(user.role) && user.status === 'ACTIVE' && !user.isGuest && user.online && user.discoverable && Boolean(user.lastSeenAt && user.lastSeenAt.getTime() > now.getTime() - 90_000);
}

export function matchesGender(role: string, gender: 'MALE' | 'FEMALE' | 'EVERYONE') {
  return gender === 'EVERYONE' || role === gender;
}

export function canStartWithBalance(coinBalance: number, coinsPerMinute: number) {
  return Number.isInteger(coinBalance) && Number.isInteger(coinsPerMinute) && coinsPerMinute > 0 && coinBalance >= coinsPerMinute;
}
