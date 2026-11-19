import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { getStripe, paymentsConfig } from '@/lib/stripe';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
export async function POST(req:Request){
  const {user,error}=await guard(['MALE','FEMALE'],{maintenance:true});if(!user)return error;
  const config=await paymentsConfig();if(!config.ok)return fail(config.reason,503);
  const parsed=z.object({packageId:z.string().min(1)}).safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Choose a coin package');
  const pack=await prisma.coinPackage.findFirst({where:{id:parsed.data.packageId,active:true}});if(!pack)return fail('This coin package is unavailable',404);
  const payment=await prisma.payment.create({data:{userId:user.id,packageId:pack.id,provider:'stripe',status:'PENDING',coins:pack.coins+pack.bonusCoins,amountCents:pack.priceCents,currency:pack.currency.toUpperCase()}});
  try{
    const origin=process.env.APP_URL||new URL(req.url).origin;const session=await (await getStripe()).checkout.sessions.create({mode:'payment',...(user.isGuest?{}:{customer_email:user.email}),line_items:[{quantity:1,price_data:{currency:pack.currency.toLowerCase(),unit_amount:pack.priceCents,product_data:{name:`${pack.coins+pack.bonusCoins} ${process.env.SITE_NAME||'Velora'} coins`}}}],metadata:{paymentId:payment.id,userId:user.id,packageId:pack.id,isGuest:String(user.isGuest)},payment_intent_data:{metadata:{paymentId:payment.id}},success_url:`${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/payment/cancel`},{idempotencyKey:`coin-checkout:${payment.id}:${randomUUID()}`});
    if(!session.url)throw new Error('Stripe did not return a Checkout URL');
    await prisma.payment.update({where:{id:payment.id},data:{providerSessionId:session.id}});return ok({url:session.url});
  }catch(e){await prisma.payment.update({where:{id:payment.id},data:{status:'FAILED',failureReason:e instanceof Error?e.message:'Stripe checkout failed'}});return fail(e instanceof Error?e.message:'Stripe checkout failed',503)}
}
