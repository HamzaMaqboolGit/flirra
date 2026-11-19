import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readProviderFlags, readProviderSecret } from '@/lib/stripe-secrets';
import { isUniqueViolation } from '@/lib/http';

export async function POST(req:Request) {
  const flags=await readProviderFlags('adapty');
  if(flags['adapty.enabled']!==true)return NextResponse.json({error:'Adapty synchronization is disabled.'},{status:503});
  const secret=await readProviderSecret('adapty.webhookSecret');
  if(!secret)return NextResponse.json({error:'Adapty webhook is not configured.'},{status:503});
  if(req.headers.get('authorization')!==secret)return NextResponse.json({error:'Unauthorized webhook.'},{status:401});
  const event=await req.json().catch(()=>null) as any;
  // Adapty sends an empty verification request when validating a newly configured endpoint.
  if(!event||Object.keys(event).length===0)return NextResponse.json({verified:true});
  const environment=event.event_properties?.environment||event.environment;
  if(environment==='Production'&&process.env.ADAPTY_LIVE_APPROVED!=='true')return NextResponse.json({error:'Production subscription synchronization is awaiting deployment approval.'},{status:403});
  const eventId=typeof event.profile_event_id==='string'?event.profile_event_id:typeof event.event_id==='string'?event.event_id:null;
  if(!eventId||typeof event.event_type!=='string')return NextResponse.json({error:'Invalid Adapty event.'},{status:400});
  try {
    const user=typeof event.customer_user_id==='string'?await prisma.user.findUnique({where:{id:event.customer_user_id},select:{id:true}}):null;
    await prisma.$transaction(async tx=>{
      await tx.adaptyEvent.create({data:{id:eventId,userId:user?.id||null,eventType:event.event_type,payload:event}});
      if(event.event_type==='access_level_updated'&&user&&typeof event.access_level_id==='string') {
        const active=event.is_active===true;
        const expiresAt=typeof event.expires_at==='string'&&Number.isFinite(Date.parse(event.expires_at))?new Date(event.expires_at):null;
        await tx.subscriptionEntitlement.upsert({where:{userId_provider_accessLevelId:{userId:user.id,provider:'adapty',accessLevelId:event.access_level_id}},create:{userId:user.id,provider:'adapty',accessLevelId:event.access_level_id,productId:typeof event.vendor_product_id==='string'?event.vendor_product_id:null,status:active?'ACTIVE':'INACTIVE',willRenew:event.will_renew===true,expiresAt},update:{productId:typeof event.vendor_product_id==='string'?event.vendor_product_id:null,status:active?'ACTIVE':'INACTIVE',willRenew:event.will_renew===true,expiresAt,lastUpdatedAt:new Date()}});
      }
    });
    return NextResponse.json({received:true});
  } catch(error) {if(isUniqueViolation(error))return NextResponse.json({received:true,duplicate:true});console.error('[adapty:webhook] event processing failed');return NextResponse.json({error:'Adapty event processing failed.'},{status:500});}
}
