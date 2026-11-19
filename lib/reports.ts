import { prisma } from '@/lib/db';

export async function createUserReport(input:{reporterId:string;reportedId:string;reason:string;details?:string;callId?:string;conversationId?:string;source?:string}){
 const since=new Date(Date.now()-10*60_000);
 const existing=await prisma.userReport.findFirst({where:{reporterId:input.reporterId,reportedId:input.reportedId,reason:input.reason,createdAt:{gte:since},...(input.callId?{callId:input.callId}:{}),...(input.conversationId?{conversationId:input.conversationId}:{})},select:{id:true}});
 if(existing)return {id:existing.id,duplicate:true};
 const highPriority=['THREATS','UNDERAGE'].includes(input.reason);
 const report=await prisma.userReport.create({data:{...input,priority:highPriority?'URGENT':'NORMAL',source:input.source||'USER_REPORT'}});
 const admins=await prisma.user.findMany({where:{role:'ADMIN',status:'ACTIVE',OR:[{adminStaff:null},{adminStaff:{is:{enabled:true,permissions:{array_contains:['moderation']}}}}]},select:{id:true}}).catch(()=>[]);
 if(admins.length)await prisma.notification.createMany({data:admins.map(admin=>({userId:admin.id,kind:'SAFETY_REPORT',payload:{reportId:report.id,reportedId:input.reportedId,reason:input.reason,priority:report.priority}}))});
 return {id:report.id,duplicate:false};
}
