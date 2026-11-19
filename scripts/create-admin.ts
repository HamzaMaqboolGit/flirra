import { prisma } from '../lib/db';
import { hashPassword } from '../lib/auth';

async function main() {
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();const password=process.env.ADMIN_PASSWORD;
  if(!email||!password||password.length<14)throw new Error('Provide ADMIN_EMAIL and a 14+ character ADMIN_PASSWORD in the environment.');
  const existing=await prisma.user.findUnique({where:{email}});const passwordHash=await hashPassword(password);
  if(existing)await prisma.user.update({where:{id:existing.id},data:{passwordHash,role:'ADMIN',status:'ACTIVE',emailVerifiedAt:new Date()}});
  else await prisma.user.create({data:{email,passwordHash,displayName:'Platform Admin',dateOfBirth:new Date('1980-01-01T00:00:00.000Z'),role:'ADMIN',emailVerifiedAt:new Date(),profile:{create:{country:'United States'}},wallet:{create:{}}}});
  console.log(`Administrator provisioned: ${email}`);
}
main().finally(()=>prisma.$disconnect());
