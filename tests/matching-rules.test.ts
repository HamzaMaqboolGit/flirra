import test from 'node:test';
import assert from 'node:assert/strict';
import { canInitiateCall, canReceiveCall, canStartWithBalance, matchesGender } from '../lib/matching-rules';
import { paidCoinsSpent, splitCredits } from '../lib/billing-math';

const account = { role:'FEMALE', accountType:'USER', creatorStatus:'NOT_APPLIED', status:'ACTIVE', isGuest:false, emailVerified:true };

test('guest accounts may initiate calls but cannot receive calls', () => {
  assert.equal(canInitiateCall({...account, role:'MALE', isGuest:true, emailVerified:false}), true);
  assert.equal(canInitiateCall({...account, isGuest:true, status:'SUSPENDED'}), false);
  assert.equal(canReceiveCall({...account, isGuest:true, online:true, discoverable:true, lastSeenAt:new Date()}), false);
});

test('registered members can call before optional email verification', () => {
  assert.equal(canInitiateCall({...account, emailVerified:false}), true);
  assert.equal(canReceiveCall({...account, emailVerified:false, online:true, discoverable:true, lastSeenAt:new Date()}), true);
});

test('creator approval is not required to initiate calls', () => {
  assert.equal(canInitiateCall(account), true);
  assert.equal(canInitiateCall({...account, accountType:'CREATOR', creatorStatus:'APPROVED'}), true);
  assert.equal(canInitiateCall({...account, accountType:'CREATOR', creatorStatus:'PENDING'}), true);
});

test('matching admits active online members and creators regardless of email verification or creator approval', () => {
  const ready = {...account, online:true, discoverable:true, lastSeenAt:new Date()};
  assert.equal(canReceiveCall(ready), true);
  assert.equal(canReceiveCall({...ready, accountType:'CREATOR', creatorStatus:'APPROVED'}), true);
  assert.equal(canReceiveCall({...ready, accountType:'CREATOR', creatorStatus:'PENDING'}), true);
  assert.equal(canReceiveCall({...ready, online:false}), false);
  assert.equal(canReceiveCall({...ready, isGuest:true}), false);
  assert.equal(canReceiveCall({...ready, status:'SUSPENDED'}), false);
  assert.equal(canReceiveCall({...ready, lastSeenAt:new Date(Date.now()-100_000)}), false);
  assert.equal(matchesGender('MALE','MALE'), true);
  assert.equal(matchesGender('FEMALE','MALE'), false);
  assert.equal(matchesGender('FEMALE','EVERYONE'), true);
});

test('call starts require a full configured minute of wallet balance', () => {
  assert.equal(canStartWithBalance(20,20), true);
  assert.equal(canStartWithBalance(19,20), false);
});

test('promotional spending never creates earnings and the configured split conserves paid value', () => {
  assert.equal(paidCoinsSpent(20,20), 0);
  assert.equal(paidCoinsSpent(20,7), 13);
  assert.deepEqual(splitCredits(paidCoinsSpent(20,7),7000), {woman:9,company:4});
});
