export type CallConsentRecord = { consentedAt: Date | null; leftAt: Date | null };

export function bothCallParticipantsConsented(participants: CallConsentRecord[]): boolean {
  return participants.length === 2 && participants.every((participant) => participant.consentedAt !== null && participant.leftAt === null);
}
