import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type BankDetails = { accountHolder: string; bankName: string; accountNumber: string; routingNumber: string; iban: string; swiftCode: string };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be configured to protect payout details.');
  return createHash('sha256').update(`flirra-bank-payout:${secret}`).digest();
}

export function encryptBankDetails(details: BankDetails) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(details), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptBankDetails(value: string | null | undefined): BankDetails | null {
  if (!value) return null;
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Stored payout details have an unsupported format.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as BankDetails;
}

export function maskBankDetails(details: BankDetails) {
  const account = details.iban || details.accountNumber;
  return account ? `•••• ${account.slice(-4)}` : '';
}
