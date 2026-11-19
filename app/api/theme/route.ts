import { prisma } from '@/lib/db';
import { defaultTheme, validTheme } from '@/lib/themes';
import { ok } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(){const row=await prisma.platformSetting.findUnique({where:{key:'theme.frontend'}});return ok({theme:validTheme(row?.value)?row.value:defaultTheme})}
