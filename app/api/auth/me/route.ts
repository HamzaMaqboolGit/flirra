import { currentUser, toClientUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const user = await currentUser({ renew: true });
  if (!user) return fail("Sign in required", 401);
  return ok({ user: toClientUser(user) });
}
