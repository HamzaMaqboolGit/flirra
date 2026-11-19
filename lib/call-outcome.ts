import type { CallStatus } from '@prisma/client';

export const CALL_RECONNECT_GRACE_MS = 12_000;
export const CALL_CONNECTION_TIMEOUT_MS = 30_000;

export function callDurationSeconds(startedAt: Date | null, endedAt: Date | null) {
  return startedAt && endedAt ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)) : 0;
}

export function terminalCallStatus(status: CallStatus, startedAt: Date | null, reason: string): CallStatus | null {
  if (status === 'RINGING') return reason === 'rejected' ? 'REJECTED' : 'CANCELLED';
  if (status !== 'ACTIVE' || reason === 'rejected' || reason === 'ring_timeout' || reason === 'unavailable') return null;
  if (reason === 'admin_terminate') return 'TERMINATED';
  if (reason === 'connection_timeout') return startedAt ? null : 'FAILED';
  if (reason === 'connection_failed' || !startedAt) return 'FAILED';
  return 'COMPLETED';
}

type CallOutcome = {
  endReason?: string | null;
  endedById?: string | null;
  startedAt: string | null;
  viewerRole: 'CALLER' | 'RECIPIENT';
  partner?: { id: string; displayName?: string } | null;
};

export function callOutcomeMessage(call: CallOutcome): string | null {
  const name = call.partner?.displayName?.trim() || 'Your call partner';
  const partnerEnded = Boolean(call.endedById && call.partner?.id === call.endedById);
  switch (call.endReason) {
    case 'rejected':
      return call.viewerRole === 'CALLER' ? `${name} declined your call. You can try your luck with others.` : null;
    case 'ring_timeout':
      return call.viewerRole === 'CALLER' ? `${name} didn't answer. Try connecting with someone else.` : null;
    case 'hangup':
    case 'next_caller':
    case 'disconnect':
      if (call.startedAt && partnerEnded) return `${name} has left. You can try your luck with others.`;
      if (call.endReason === 'disconnect') return 'The connection was lost. Try connecting with someone else.';
      return null;
    case 'connection_failed':
    case 'connection_timeout':
    case 'server_restart':
      return 'The video connection was lost. Try connecting with someone else.';
    case 'unavailable':
      return call.viewerRole === 'CALLER' ? `${name} is no longer available. Try connecting with someone else.` : null;
    case 'insufficient_balance':
      return 'There are not enough coins to continue this call.';
    case 'pricing_unconfigured':
      return 'Call pricing is unavailable. Please try again later.';
    case 'admin_terminate':
      return 'Flirra ended this call.';
    default:
      return null;
  }
}
