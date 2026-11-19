import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok, isUniqueViolation } from '@/lib/http';
import { paypalAccessToken, paypalBase, paypalConfig } from '@/lib/paypal';

export async function POST(request: Request) {
  const { user, error } = await guard(['MALE','FEMALE'], { maintenance: true }); if (!user) return error;
  const parsed = z.object({ packageId:z.string().min(1), requestId:z.string().uuid() }).safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return fail('Choose a valid coin package.');
  const config = await paypalConfig();
  if (!config.enabled || !config.clientId || !config.clientSecret || !config.webhookId) return fail('PayPal is not fully configured in Admin → Payment Settings.',503);
  if (config.environment === 'live' && (process.env.PAYPAL_LIVE_APPROVED !== 'true' || process.env.PAYMENTS_LIVE !== 'true')) return fail('PayPal live checkout is blocked until the deployment operator confirms provider approval and enables PAYPAL_LIVE_APPROVED and PAYMENTS_LIVE.',503);
  const pack = await prisma.coinPackage.findFirst({where:{id:parsed.data.packageId,active:true}});
  if (!pack || pack.priceCents < 1 || pack.coins < 1 || !/^[A-Z]{3}$/i.test(pack.currency)) return fail('This coin package is unavailable.',404);
  let payment = await prisma.payment.findUnique({where:{checkoutRequestId:parsed.data.requestId}});
  if (payment && (payment.userId !== user.id || payment.provider !== 'paypal')) return fail('This checkout request cannot be used by this account.',409);
  if (!payment) try { payment = await prisma.payment.create({data:{userId:user.id,packageId:pack.id,provider:'paypal',status:'PENDING',coins:pack.coins+pack.bonusCoins,amountCents:pack.priceCents,currency:pack.currency.toUpperCase(),checkoutRequestId:parsed.data.requestId}}); }
  catch(cause) { if(!isUniqueViolation(cause)) throw cause; payment=await prisma.payment.findUnique({where:{checkoutRequestId:parsed.data.requestId}}); }
  if (!payment) return fail('Could not prepare this checkout. Retry once.',503);
  if (payment.providerSessionId) {
    try { const token=await paypalAccessToken(config); const existing=await fetch(`${paypalBase(config.environment)}/v2/checkout/orders/${encodeURIComponent(payment.providerSessionId)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(10000)}); const order=await existing.json() as {links?:Array<{rel:string;href:string}>}; const approvalUrl=order.links?.find(link=>link.rel==='approve')?.href; if(approvalUrl)return ok({approvalUrl}); }
    catch { return fail('Existing PayPal checkout could not be reopened. Start a new checkout.',503); }
    return fail('Existing PayPal checkout is no longer available. Start a new checkout.',409);
  }
  try {
    const token=await paypalAccessToken(config), origin=process.env.APP_URL||new URL(request.url).origin;
    const response=await fetch(`${paypalBase(config.environment)}/v2/checkout/orders`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','PayPal-Request-Id':`flirra-order-${payment.id}`},body:JSON.stringify({intent:'CAPTURE',purchase_units:[{reference_id:payment.id,custom_id:payment.id,invoice_id:`flirra-${payment.id}`,amount:{currency_code:payment.currency,value:(payment.amountCents/100).toFixed(2)},description:`${payment.coins} Flirra coins`}],application_context:{brand_name:'Flirra',user_action:'PAY_NOW',return_url:`${origin}/wallet/paypal/return`,cancel_url:`${origin}/wallet/paypal/return?cancelled=1`}}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const order=await response.json() as {id?:string;links?:Array<{rel:string;href:string}>};
    const approvalUrl=order.links?.find(link=>link.rel==='approve')?.href;
    if(!response.ok||!order.id||!approvalUrl) throw new Error('PayPal could not create an approval order.');
    await prisma.payment.update({where:{id:payment.id},data:{providerSessionId:order.id}});
    return ok({approvalUrl});
  } catch(error) { await prisma.payment.updateMany({where:{id:payment.id,status:'PENDING'},data:{status:'FAILED',failureReason:'PayPal order creation failed'}}); console.error('[paypal:create] order request failed'); return fail(error instanceof Error?error.message:'PayPal checkout could not be opened.',503); }
}
