import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { creditPurchase } from '@/lib/billing';
import { paypalAccessToken, paypalBase, paypalConfig } from '@/lib/paypal';

export async function POST(request:Request) {
  const {user,error}=await guard(['MALE','FEMALE'],{maintenance:true}); if(!user)return error;
  const parsed=z.object({orderId:z.string().min(5).max(64)}).safeParse(await request.json().catch(()=>null)); if(!parsed.success)return fail('Invalid PayPal order.');
  const payment=await prisma.payment.findFirst({where:{provider:'paypal',providerSessionId:parsed.data.orderId,userId:user.id}});
  if(!payment)return fail('This PayPal order does not belong to your account.',404);
  if(payment.status==='SUCCEEDED')return ok({verified:true,coins:payment.coins});
  const config=await paypalConfig(); if(!config.enabled)return fail('PayPal checkout is disabled.',503);
  try {
    const token=await paypalAccessToken(config);
    const response=await fetch(`${paypalBase(config.environment)}/v2/checkout/orders/${encodeURIComponent(parsed.data.orderId)}/capture`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','PayPal-Request-Id':`flirra-capture-${payment.id}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
    const order=await response.json() as any;
    const capture=order.purchase_units?.[0]?.payments?.captures?.[0];
    if(!response.ok||order.status!=='COMPLETED'||!capture||capture.status!=='COMPLETED')return fail(order.status==='VOIDED'?'This PayPal payment was cancelled.':'PayPal has not confirmed this payment yet.',409);
    if(order.purchase_units?.[0]?.reference_id!==payment.id||capture.amount.currency_code!==payment.currency||Math.round(Number(capture.amount.value)*100)!==payment.amountCents)return fail('PayPal payment details did not match the order.',409);
    await prisma.payment.update({where:{id:payment.id},data:{providerPaymentId:capture.id}});
    await creditPurchase(payment.id,`paypal:${capture.id}`);
    return ok({verified:true,coins:payment.coins});
  } catch { console.error('[paypal:capture] capture request failed'); return fail('PayPal could not confirm this payment. If charged, contact support before retrying.',503); }
}
