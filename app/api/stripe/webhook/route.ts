import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { creditPurchase, reversePayment } from '@/lib/billing';
import { isUniqueViolation } from '@/lib/http';
import { stripeWebhookConfig } from '@/lib/stripe';
import { emitTo } from '@/lib/calls';
export async function POST(req:Request){
  const config=await stripeWebhookConfig();if(!config.ok)return NextResponse.json({error:config.reason},{status:503});
  const signature=req.headers.get('stripe-signature');if(!signature)return NextResponse.json({error:'Missing Stripe signature.'},{status:400});
  let event:Stripe.Event;try{event=new Stripe(config.key).webhooks.constructEvent(await req.text(),signature,config.webhookSecret)}catch{return NextResponse.json({error:'Invalid Stripe signature.'},{status:400})}
  try{
    await prisma.stripeEvent.create({data:{id:event.id,type:event.type}});
    if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
      const session=event.data.object as Stripe.Checkout.Session;const paymentId=session.metadata?.paymentId;
      if(session.payment_status==='paid'&&paymentId){const payment=await prisma.payment.findUnique({where:{id:paymentId},include:{user:{select:{stripeCustomerId:true}}}});if(!payment||payment.providerSessionId!==session.id||session.metadata?.userId!==payment.userId||session.metadata?.packageId!==payment.packageId)throw new Error('Payment record mismatch.');if(session.amount_total!==payment.amountCents||session.currency!==payment.currency.toLowerCase())throw new Error('Payment amount or currency mismatch.');if(payment.user.stripeCustomerId&&typeof session.customer==='string'&&payment.user.stripeCustomerId!==session.customer)throw new Error('Payment customer mismatch.');await prisma.payment.update({where:{id:payment.id},data:{providerPaymentId:typeof session.payment_intent==='string'?session.payment_intent:null}});try{await creditPurchase(payment.id,`stripe:${session.id}`);const wallet=await prisma.wallet.findUnique({where:{userId:payment.userId},select:{coinBalance:true}});emitTo(payment.userId,'wallet:update',{wallet});console.info('[stripe-webhook] verified purchase credited',{sessionId:session.id,paymentId:payment.id,coins:payment.coins})}catch(error){console.error('[stripe-webhook] verified purchase credit failed',{sessionId:session.id,paymentId:payment.id,error:error instanceof Error?error.message:'unknown error'});throw error}}
    }else if(event.type==='checkout.session.expired'){
      const session=event.data.object as Stripe.Checkout.Session;await prisma.payment.updateMany({where:{providerSessionId:session.id,status:'PENDING'},data:{status:'FAILED',failureReason:'Checkout expired'}});
    }else if(event.type==='payment_intent.payment_failed'){
      const intent=event.data.object as Stripe.PaymentIntent;const paymentId=intent.metadata.paymentId;if(paymentId)await prisma.payment.updateMany({where:{id:paymentId,status:'PENDING'},data:{status:'FAILED',failureReason:intent.last_payment_error?.message||'Payment failed'}});
    }else if(event.type==='checkout.session.async_payment_failed'){
      const session=event.data.object as Stripe.Checkout.Session;await prisma.payment.updateMany({where:{providerSessionId:session.id,status:'PENDING'},data:{status:'FAILED',failureReason:'Asynchronous payment failed'}});
    }else if(event.type==='charge.refunded'){
      const charge=event.data.object as Stripe.Charge;const intent=typeof charge.payment_intent==='string'?charge.payment_intent:null;const payment=intent?await prisma.payment.findUnique({where:{providerPaymentId:intent}}):null;
      if(payment){const refunds=charge.refunds?.data||[];for(const refund of refunds)await reversePayment(payment.id,refund.amount,refund.id,refund.reason||'stripe_refund')}
    }else if(event.type==='account.updated'){
      const account=event.data.object as Stripe.Account;const payout=await prisma.payoutAccount.findFirst({where:{providerAccountRef:account.id}});
      if(payout){const verified=Boolean(account.details_submitted&&account.payouts_enabled);await prisma.payoutAccount.update({where:{id:payout.id},data:{identityStatus:verified?'VERIFIED':account.requirements?.disabled_reason?'REJECTED':'PENDING',verifiedAt:verified?new Date():null}})}
    }else if(event.type==='identity.verification_session.verified'){
      const session=event.data.object as Stripe.Identity.VerificationSession;const userId=session.metadata?.userId;if(userId){await prisma.payoutAccount.upsert({where:{userId},create:{userId,identityStatus:'VERIFIED',verifiedAt:new Date()},update:{identityStatus:'VERIFIED',verifiedAt:new Date()}})}
    }else if(event.type==='payout.paid'||event.type==='payout.failed'){
      const payout=event.data.object as Stripe.Payout;const withdrawalId=payout.metadata?.withdrawalId;
      if(withdrawalId){const row=await prisma.withdrawalRequest.findUnique({where:{id:withdrawalId}});if(row&&(row.status==='PROCESSING'||row.status==='APPROVED')){if(event.type==='payout.paid'){await prisma.$transaction(async tx=>{await tx.withdrawalRequest.update({where:{id:row.id},data:{status:'COMPLETED',processedAt:new Date(),payoutRef:payout.id}});await tx.coinTransaction.create({data:{userId:row.userId,type:'WITHDRAWAL_PAID',credits:-row.amountCredits,amountCents:-row.amountCents,idempotencyKey:`withdrawal:${row.id}:paid`,metadata:{payoutId:payout.id}}})})}else{await prisma.$transaction(async tx=>{await tx.withdrawalRequest.update({where:{id:row.id},data:{status:'FAILED',payoutRef:payout.id,decisionReason:payout.failure_message||'Payout failed'}});await tx.wallet.update({where:{userId:row.userId},data:{availableCredits:{increment:row.amountCredits}}});await tx.coinTransaction.create({data:{userId:row.userId,type:'WITHDRAWAL_RELEASE',credits:row.amountCredits,amountCents:row.amountCents,idempotencyKey:`withdrawal:${row.id}:release`,metadata:{payoutId:payout.id}}})})}}}
    }
    return NextResponse.json({received:true});
  }catch(error){if(isUniqueViolation(error))return NextResponse.json({received:true,duplicate:true});await prisma.stripeEvent.delete({where:{id:event.id}}).catch(()=>undefined);console.error('[stripe-webhook]',error);return NextResponse.json({error:'Webhook processing failed. Stripe may retry.'},{status:500})}
}
