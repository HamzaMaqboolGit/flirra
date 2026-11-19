import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { getSettings } from '@/lib/settings';
export async function POST(){
 const user=await currentUser();if(!user)return fail('Sign in required',401);
 const settings=await getSettings();if(!settings.dailyRewardsEnabled||!settings.dailyRewardCoins)return fail('Daily rewards are currently unavailable',403);
 const day=new Date().toISOString().slice(0,10), claimKey=`daily:${user.id}:${day}`;
 if(settings.dailyRewardCoins==null||settings.maxPromoCoins==null)return fail('Daily reward values must be configured before rewards are available',503);const coins=Math.min(settings.dailyRewardCoins,Math.max(0,settings.maxPromoCoins-user.wallet!.promotionalCoins));if(coins<=0)return fail('Your promotional coin limit has been reached');
 const expiresAt=settings.rewardExpirationDays?new Date(Date.now()+settings.rewardExpirationDays*86_400_000):null;
 try{await prisma.$transaction(async tx=>{await tx.rewardClaim.create({data:{userId:user.id,rewardType:'DAILY',coins,claimKey,expiresAt}});await tx.wallet.update({where:{userId:user.id},data:{coinBalance:{increment:coins},promotionalCoins:{increment:coins}}});await tx.coinTransaction.create({data:{userId:user.id,type:'PROMOTIONAL_REWARD',coins,promotionalCoins:coins,idempotencyKey:claimKey,metadata:{rewardType:'DAILY',expiresAt:expiresAt?.toISOString()||null}}})});return ok({coins})}catch{return fail('Today’s reward was already claimed',409)}
}
