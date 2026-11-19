/** Convert a React list key into the original record ID used by admin APIs. */
export function normalizeAdminTableId(key: string | null | undefined, index: number): string {
  return String(key ?? index).replace(/^\.\$/, '');
}
