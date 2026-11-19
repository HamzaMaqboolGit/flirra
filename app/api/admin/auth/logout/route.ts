import { logoutAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export async function POST() {
  try {
    await logoutAdmin();
    return ok();
  } catch (error) {
    console.error('[admin:logout]', error);
    return fail('Could not sign out. Please try again.', 503);
  }
}
