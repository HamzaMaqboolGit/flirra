import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { creditPurchase, reversePayment } from '@/lib/billing';
import { isUniqueViolation } from '@/lib/http';
import { paypalAccessToken, paypalBase, paypalConfig } from '@/lib/paypal';

export async function POST(req:Request) {
  const config=await paypalConfig(); if(!config.clientId||!config.clientSecret||!config.webhookId)return NextResponse.json({error:'PayPal webhook is not configured.'},{status:503});
  const rawBody=await req.text(); let event:any; try{event=JSON.parse(rawBody)}catch{return NextResponse.json({error:'Invalid PayPal event.'},{status:400})} if(!event?.id||!event?.event_type)return NextResponse.json({error:'Invalid PayPal event.'},{status:400});
  const header=(name:string)=>req.headers.get(name);
  try {
    const token=await paypalAccessToken(config);
    const verification={auth_algo:header('paypal-auth-algo'),cert_url:header('paypal-cert-url'),transmission_id:header('paypal-transmission-id'),transmission_sig:header('paypal-transmission-sig'),transmission_time:header('paypal-transmission-time'),webhook_id:config.webhookId};
    const verify=await fetch(`${paypalBase(config.environment)}/v1/notifications/verify-webhook-signature`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:`${JSON.stringify(verification).slice(0,-1)},"webhook_event":${rawBody}}`,cache:'no-store',signal:AbortSignal.timeout(10000)});
    const result=await verify.json() as {verification_status?:string}; if(!verify.ok||result.verification_status!=='SUCCESS')return NextResponse.json({error:'Invalid PayPal signature.'},{status:400});
  } catch { return NextResponse.json({error:'PayPal signature verification failed.'},{status:503}); }
  try {
    await prisma.stripeEvent.create({data:{id:`paypal:${event.id}`,type:event.event_type}});
    const resource=event.resource||{};
    if(event.event_type==='PAYMENT.CAPTURE.COMPLETED') {
      const orderId=resource.supplementary_data?.related_ids?.order_id;
      const payment=orderId?await prisma.payment.findFirst({where:{provider:'paypal',providerSessionId:orderId}}):null;
      if(payment&&resource.status==='COMPLETED'&&resource.amount?.currency_code===payment.currency&&Math.round(Number(resource.amount.value)*100)===payment.amountCents) {
        await prisma.payment.update({where:{id:payment.id},data:{providerPaymentId:resource.id}}); await creditPurchase(payment.id,`paypal:${resource.id}`);
      }
    } else if(event.event_type==='PAYMENT.CAPTURE.REFUNDED') {
      const captureId=resource.capture_id||resource.supplementary_data?.related_ids?.capture_id||resource.id;
      const payment=await prisma.payment.findFirst({where:{provider:'paypal',providerPaymentId:captureId}});
      if(payment){
        const token=await paypalAccessToken(config);
        const captureResponse=await fetch(`${paypalBase(config.environment)}/v2/payments/captures/${encodeURIComponent(captureId)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
        const capture=await captureResponse.json() as any;
        const totalRefunded=capture.seller_receivable_breakdown?.total_refunded_amount;
        if(!captureResponse.ok||totalRefunded?.currency_code!==payment.currency)throw new Error('Could not verify PayPal refund totals.');
        const refundedCents=Math.round(Number(totalRefunded.value)*100),delta=Math.max(0,refundedCents-payment.refundedCents);
        if(delta>0)await reversePayment(payment.id,delta,event.id,'paypal_refund');
      }
    } else if(event.event_type==='PAYMENT.CAPTURE.DENIED'||event.event_type==='CHECKOUT.ORDER.VOIDED') {
      const orderId=resource.id; await prisma.payment.updateMany({where:{provider:'paypal',providerSessionId:orderId,status:'PENDING'},data:{status:'FAILED',failureReason:'PayPal payment was not completed'}});
    }
    return NextResponse.json({received:true});
  } catch(error) { if(isUniqueViolation(error))return NextResponse.json({received:true,duplicate:true}); await prisma.stripeEvent.delete({where:{id:`paypal:${event.id}`}}).catch(()=>undefined); console.error('[paypal:webhook] event processing failed'); return NextResponse.json({error:'Webhook processing failed. PayPal may retry.'},{status:500}); }
}
