/** Read JSON responses without crashing when an upstream/server failure is empty. */
export async function readApiJson(response: Response, fallback: string): Promise<any> {
  const body = await response.text();
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Turn framework/proxy HTML and malformed bodies into a useful UI error.
    }
  }
  return { error: `${fallback} (HTTP ${response.status})` };
}
