import type { Role } from "@prisma/client";
import type { NextResponse } from "next/server";
import { currentAdmin, currentUser, type SessionUser } from "./auth";
import { fail } from "./http";
import { getSettings } from "./settings";

type GuardResult = { user: SessionUser; error: null } | { user: null; error: NextResponse };
export async function guard(roles?: Role[], options?: { allowSuspended?: boolean; maintenance?: boolean; permission?: string }): Promise<GuardResult> {
  const user = roles?.includes("ADMIN") ? await currentAdmin() : await currentUser();
  if (!user) return { user: null, error: fail("Sign in required", 401) };
  if (user.status === "SUSPENDED" && !options?.allowSuspended) return { user: null, error: fail("This account is suspended", 403) };
  if (roles && !roles.includes(user.role)) return { user: null, error: fail("You do not have access", 403) };
  if (user.role === "ADMIN") {
    const staff = await (await import("./db")).prisma.adminStaff.findUnique({ where: { userId: user.id } });
    if (staff && !staff.enabled) return { user: null, error: fail("This staff account is disabled", 403) };
    if (staff && (!options?.permission || !(Array.isArray(staff.permissions) && staff.permissions.includes(options.permission)))) return { user: null, error: fail("You do not have permission to perform this action", 403) };
  }
  if (options?.maintenance && user.role !== "ADMIN") {
    const settings = await getSettings();
    if (settings.maintenanceMode) return { user: null, error: fail("Velora is temporarily in maintenance", 503) };
  }
  return { user, error: null };
}
