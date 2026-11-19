import test from 'node:test';
import assert from 'node:assert/strict';
import { paypalAccessToken, paypalBase } from '../lib/paypal';

test('PayPal selects its documented sandbox and live REST hosts',()=>{
  assert.equal(paypalBase('sandbox'),'https://api-m.sandbox.paypal.com');
  assert.equal(paypalBase('live'),'https://api-m.paypal.com');
});

test('PayPal OAuth uses server credentials and returns an access token without exposing credential values',async()=>{
  const previous=globalThis.fetch;let request:RequestInfo|URL|undefined;
  globalThis.fetch=async(input,init)=>{request=input;assert.equal(init?.method,'POST');assert.match(String((init?.headers as Record<string,string>).Authorization),/^Basic /);return new Response(JSON.stringify({access_token:'mock-token'}),{status:200,headers:{'Content-Type':'application/json'}})};
  try{
    const token=await paypalAccessToken({enabled:true,environment:'sandbox',clientId:'mock-client',clientSecret:'mock-secret',webhookId:'mock-webhook'});
    assert.equal(token,'mock-token');
    assert.equal(String(request),'https://api-m.sandbox.paypal.com/v1/oauth2/token');
  }finally{globalThis.fetch=previous}
});

test('PayPal rejects invalid credentials with a sanitized message',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'invalid_client',error_description:'sensitive provider response'}),{status:401});
  try{await assert.rejects(()=>paypalAccessToken({enabled:true,environment:'sandbox',clientId:'mock-client',clientSecret:'mock-secret',webhookId:'mock-webhook'}),/PayPal rejected these credentials/)}
  finally{globalThis.fetch=previous}
});
