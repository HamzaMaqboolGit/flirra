const ARTWORK: Record<string, string> = {
  glow: '/velora-landing/coins/clean/glow.webp',
  aura: '/velora-landing/coins/clean/aura.webp',
  spark: '/velora-landing/coins/clean/spark.webp',
  noir: '/velora-landing/coins/clean/noir.webp',
};

export function coinPackageArtwork(name: string, configuredUrl?: string | null) {
  return configuredUrl?.trim() || ARTWORK[name.trim().toLowerCase()] || ARTWORK.spark;
}
