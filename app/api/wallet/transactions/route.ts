import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { ok } from '@/lib/http';
export async function GET(req:Request){const {user,error}=await guard(undefined,{allowSuspended:true});if(!user)return error;const url=new URL(req.url),cursor=url.searchParams.get('cursor'),requested=Number(url.searchParams.get('limit')||50),limit=Number.isFinite(requested)?Math.min(100,Math.max(1,Math.trunc(requested))):50;const rows=await prisma.coinTransaction.findMany({where:{userId:user.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{})});const hasMore=rows.length>limit;if(hasMore)rows.pop();return ok({transactions:rows,nextCursor:hasMore?rows.at(-1)?.id:null})}
