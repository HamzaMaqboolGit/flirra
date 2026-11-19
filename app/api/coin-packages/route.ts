import { ok } from '@/lib/http';
import { getActiveCoinPackages, orderCoinPackages } from '@/lib/coin-packages';

/** Public, active catalog backed by the same packages managed in Admin. */
export async function GET() {
  const packages = await getActiveCoinPackages();
  return ok({ packages: orderCoinPackages(packages) });
}
