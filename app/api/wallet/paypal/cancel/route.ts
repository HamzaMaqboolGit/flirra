import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
export async function POST(req:Request){const {user,error}=await guard(['MALE','FEMALE']);if(!user)return error;const parsed=z.object({orderId:z.string().min(5).max(64)}).safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Invalid PayPal order.');const result=await prisma.payment.updateMany({where:{provider:'paypal',providerSessionId:parsed.data.orderId,userId:user.id,status:'PENDING'},data:{status:'FAILED',failureReason:'Buyer cancelled PayPal checkout'}});return ok({cancelled:result.count===1})}
