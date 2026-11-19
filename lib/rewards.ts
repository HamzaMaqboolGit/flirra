import { createHash } from 'node:crypto';
import { prisma } from './db';

/** Expires unused promo grants FIFO while leaving paid coins and the immutable history intact. */
export async function expirePromotionalCoins(userId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const locked=await tx.$queryRaw<Array<{promotionalCoins:number}>>`SELECT "promotionalCoins" FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    if (!locked.length || locked[0].promotionalCoins <= 0) return 0;
    const [claims, spends] = await Promise.all([
      tx.rewardClaim.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      tx.coinTransaction.findMany({ where: { userId, type: 'CALL_SPEND', promotionalCoins: { lt: 0 } }, orderBy: { createdAt: 'asc' } }),
    ]);
    const events = [
      ...claims.map(claim => ({ at: claim.createdAt, kind: 'grant' as const, coins: claim.coins, claim })),
      ...spends.map(spend => ({ at: spend.createdAt, kind: 'spend' as const, coins: -spend.promotionalCoins, claim: null })),
    ].sort((a,b)=>a.at.getTime()-b.at.getTime());
    const lots: Array<{remaining:number;expiresAt:Date|null;id:string}> = [];
    for (const event of events) {
      if (event.kind === 'grant') lots.push({remaining:event.coins,expiresAt:event.claim!.expiresAt,id:event.claim!.id});
      else {
        let amount=event.coins;
        for (const lot of lots) { const consumed=Math.min(lot.remaining,amount);lot.remaining-=consumed;amount-=consumed;if(amount<=0)break; }
      }
    }
    const expiredLots=lots.filter(lot=>lot.expiresAt&&lot.expiresAt<=now&&lot.remaining>0);
    const expired=Math.min(locked[0].promotionalCoins,expiredLots.reduce((sum,lot)=>sum+lot.remaining,0));
    if(expired<1)return 0;
    const claimIds=expiredLots.filter(lot=>lot.remaining).map(lot=>lot.id).sort().join(',');
    const idempotencyKey=`promo-expire:${userId}:${createHash('sha256').update(claimIds).digest('hex').slice(0,24)}`;
    const inserted=await tx.coinTransaction.createMany({data:[{userId,type:'PROMOTIONAL_REWARD',coins:-expired,promotionalCoins:-expired,idempotencyKey,metadata:{rewardType:'EXPIRATION',claimIds:claimIds.split(',')}}],skipDuplicates:true});
    if(!inserted.count)return 0;
    await tx.wallet.update({where:{userId},data:{coinBalance:{decrement:expired},promotionalCoins:{decrement:expired}}});
    return expired;
  });
}
