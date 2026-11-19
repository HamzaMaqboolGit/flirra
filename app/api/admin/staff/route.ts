import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { currentAdmin, hashPassword, hashToken } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { fail, ok } from '@/lib/http';

const roles = ['SUPER_ADMIN','ADMIN','SUPPORT_MANAGER','SUPPORT_AGENT','FINANCE_MANAGER','MODERATOR'] as const;
const permissions = ['dashboard','users','creators','support','payments','payouts','moderation','staff','settings'] as const;
const isSuper = async (adminId: string) => {
  const profile = await prisma.adminStaff.findUnique({where:{userId:adminId}});
  return !profile || (profile.enabled && profile.staffRole === 'SUPER_ADMIN');
};
async function audit(adminId:string, action:string, targetId?:string, metadata?:Record<string,unknown>) {
  await prisma.adminAuditLog.create({data:{adminId,action,targetId,metadata:metadata as any}});
}
async function activeSuperAdmins(){const [explicit,legacy]=await Promise.all([prisma.adminStaff.count({where:{staffRole:'SUPER_ADMIN',enabled:true,user:{status:'ACTIVE'}}}),prisma.user.count({where:{role:'ADMIN',status:'ACTIVE',adminStaff:null}})]);return explicit+legacy;}

export async function GET(req:Request) {
  const admin = await currentAdmin(); if (!admin) return fail('Sign in required',401);
  const profile=await prisma.adminStaff.findUnique({where:{userId:admin.id}});
  if (profile && (!profile.enabled || !Array.isArray(profile.permissions) || !(profile.permissions as string[]).includes('staff'))) return fail('You do not have permission to manage staff.',403);
  if(new URL(req.url).searchParams.get('view')==='logs')return ok({auditLogs:await prisma.adminAuditLog.findMany({where:{OR:[{action:{startsWith:'staff.'}},{action:{startsWith:'admin.'}}]},include:{admin:{select:{displayName:true,email:true}}},orderBy:{createdAt:'desc'},take:300})});
  const staff=await prisma.adminStaff.findMany({include:{user:{select:{id:true,email:true,displayName:true,status:true,sessions:{select:{id:true,expiresAt:true}}},},invitations:{where:{acceptedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:1}},orderBy:{createdAt:'desc'}});
  return ok({staff:staff.map(({user,invitations,...row})=>({...row,user,lastLoginAt:row.lastLoginAt,sessionCount:user.sessions.filter(s=>s.expiresAt>new Date()).length,invitationPending:invitations.length>0})),roles,permissions});
}

export async function POST(req:Request) {
  const admin=await currentAdmin(); if(!admin)return fail('Sign in required',401);
  if(!(await isSuper(admin.id)))return fail('Only a Super Admin can manage staff accounts.',403);
  const body=await req.json().catch(()=>null) as Record<string,any>|null;
  if(!body||typeof body.action!=='string')return fail('Invalid staff action.');
  if(body.action==='create'){
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),phone=String(body.phone||'').trim(),department=String(body.department||'').trim(),role=String(body.role||'');
    const access=role==='SUPER_ADMIN'?[...permissions]:Array.isArray(body.permissions)?body.permissions.filter((p:string)=>permissions.includes(p as any)):[];
    if(name.length<2||name.length>80||!/^\S+@\S+\.\S+$/.test(email)||phone.length>40||department.length>80||!roles.includes(role as any))return fail('Enter valid staff details and role.');
    if(await prisma.user.findUnique({where:{email}}))return fail('An account with this email already exists.',409);
    const token=randomBytes(32).toString('base64url');
    const result=await prisma.$transaction(async tx=>{
      const user=await tx.user.create({data:{email,displayName:name,passwordHash:await hashPassword(randomBytes(36).toString('base64url')),role:'ADMIN',accountType:'USER'}});
      const staff=await tx.adminStaff.create({data:{userId:user.id,phone,department,staffRole:role,permissions:access}});
      if(role==='SUPPORT_MANAGER'||role==='SUPPORT_AGENT')await tx.supportAgent.create({data:{userId:user.id,availability:'OFFLINE',maxChats:3}});
      await tx.adminStaffInvitation.create({data:{staffId:staff.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+72*60*60*1000)}});
      return {user,staff};
    });
    const inviteUrl=`${process.env.APP_URL||'http://localhost:3100'}/admin/invitation?token=${encodeURIComponent(token)}`;
    const sent=await sendEmail(email,'Your Flirra staff invitation',`<p>Hello ${name.replace(/[&<>"']/g,'')},</p><p>You have been invited to join Flirra as ${role.replaceAll('_',' ')}.</p><p><a href="${inviteUrl}">Set your password and accept invitation</a></p><p>This secure link expires in 72 hours and can be used once.</p>`);
    await audit(admin.id,'staff.created',result.user.id,{role,department,permissions:access,invitationEmailDelivered:sent.delivered});
    return ok({created:true,invitationEmailDelivered:sent.delivered,...(process.env.NODE_ENV!=='production'&&!sent.delivered?{developmentInvitationUrl:inviteUrl}:{})});
  }
  const staff=await prisma.adminStaff.findUnique({where:{id:String(body.staffId||'')},include:{user:true}}); if(!staff)return fail('Staff member not found.',404);
  if(body.action==='disable'||body.action==='reactivate'){
    if(body.action==='disable'&&staff.staffRole==='SUPER_ADMIN'){
      const active=await activeSuperAdmins();
      if(active<=1)return fail('The final active Super Admin cannot be disabled.',409);
    }
    const enabled=body.action==='reactivate';
    await prisma.$transaction([prisma.adminStaff.update({where:{id:staff.id},data:{enabled}}),...(enabled?[]:[prisma.userSession.deleteMany({where:{userId:staff.userId}})])]);
    await audit(admin.id,`staff.${body.action}`,staff.userId); return ok({updated:true});
  }
  if(body.action==='revoke-sessions'){
    const result=await prisma.userSession.deleteMany({where:{userId:staff.userId}});await audit(admin.id,'staff.sessions_revoked',staff.userId,{count:result.count});return ok({revoked:result.count});
  }
  if(body.action==='edit'){
    const role=String(body.role||staff.staffRole),access=Array.isArray(body.permissions)?body.permissions.filter((p:string)=>permissions.includes(p as any)):staff.permissions as string[];
    if(!roles.includes(role as any)&&role!=='SUPER_ADMIN')return fail('Choose a valid staff role.');
    if(staff.staffRole==='SUPER_ADMIN'&&role!=='SUPER_ADMIN'&&(await activeSuperAdmins())<=1)return fail('The final active Super Admin cannot be demoted.',409);
    await prisma.adminStaff.update({where:{id:staff.id},data:{staffRole:role,permissions:access,department:String(body.department??staff.department).slice(0,80),phone:String(body.phone??staff.phone).slice(0,40)}});
    await audit(admin.id,'staff.permissions_updated',staff.userId,{role,permissions:access});return ok({updated:true});
  }
  if(body.action==='resend-invitation'){
    const token=randomBytes(32).toString('base64url');
    await prisma.adminStaffInvitation.updateMany({where:{staffId:staff.id,acceptedAt:null},data:{expiresAt:new Date()}});
    await prisma.adminStaffInvitation.create({data:{staffId:staff.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+72*60*60*1000)}});
    const inviteUrl=`${process.env.APP_URL||'http://localhost:3100'}/admin/invitation?token=${encodeURIComponent(token)}`;
    const sent=await sendEmail(staff.user.email,'Your Flirra staff invitation',`<p><a href="${inviteUrl}">Set your password and accept invitation</a></p><p>This link expires in 72 hours and can be used once.</p>`);
    await audit(admin.id,'staff.invitation_resent',staff.userId,{delivered:sent.delivered});return ok({sent:sent.delivered,...(process.env.NODE_ENV!=='production'&&!sent.delivered?{developmentInvitationUrl:inviteUrl}:{})});
  }
  return fail('Unknown staff action.');
}
