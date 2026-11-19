import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema } from '../lib/validators';

const registration = {
  email: 'adult@example.test',
  password: 'SafePass123',
  displayName: 'Member Name',
  dateOfBirth: '1999-05-01',
  role: 'FEMALE',
  accountType: 'USER',
  country: 'Albania',
};

test('registration requires explicit adult confirmation as well as an adult date of birth', () => {
  assert.equal(registerSchema.safeParse({ ...registration, confirmedAdult: true }).success, true);
  assert.equal(registerSchema.safeParse(registration).success, false);
  assert.equal(registerSchema.safeParse({ ...registration, confirmedAdult: false }).success, false);
});

test('registration rejects underage and impossible dates even when confirmed', () => {
  assert.equal(registerSchema.safeParse({ ...registration, confirmedAdult: true, dateOfBirth: '2010-05-01' }).success, false);
  assert.equal(registerSchema.safeParse({ ...registration, confirmedAdult: true, dateOfBirth: '1999-02-31' }).success, false);
});
