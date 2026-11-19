export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

export function creditsLabel(value: number) {
  return `${(value || 0).toLocaleString()} cr`;
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function clientIp(header: string | null) {
  return header?.split(",")[0]?.trim() || "local";
}
