import { z } from 'zod';
import { currentUser, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { rateLimit } from '@/lib/redis';
import { ensureOfficialConversations } from '@/lib/support';

const schema=z.object({email:z.email().max(254),password:z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/[0-9]/)});

export async function POST(request:Request){
  const user=await currentUser();
  if(!user)return fail('Sign in to complete your guest account.',401);
  if(!user.isGuest)return fail('This account is already registered.',409);
  if(!(await rateLimit(`guest-convert:${user.id}`,5,3600)))return fail('Too many account conversion attempts. Try again later.',429);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return fail(parsed.error.issues[0]?.message||'Enter a valid email and password.');
  const email=parsed.data.email.trim().toLowerCase();
  try{
    const updated=await prisma.$transaction(async tx=>{
      const collision=await tx.user.findUnique({where:{email},select:{id:true}});
      if(collision&&collision.id!==user.id)throw new Error('An account with that email already exists. Sign in to it separately.');
      return tx.user.update({where:{id:user.id},data:{email,passwordHash:await hashPassword(parsed.data.password),isGuest:false,guestExpiresAt:null},select:{id:true,email:true,isGuest:true}});
    });
    await ensureOfficialConversations(updated.id);
    return ok({converted:true,user:updated});
  }catch(error){
    if(typeof error==='object'&&error!==null&&'code'in error&&error.code==='P2002')return fail('An account with that email already exists.',409);
    return fail(error instanceof Error?error.message:'Could not complete your account.',500);
  }
}
