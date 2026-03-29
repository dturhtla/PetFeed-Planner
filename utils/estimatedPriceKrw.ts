import type { ChatReplyLocale } from "./chatLocale";

/** Korean won: thousands separator + ₩ (KRW), from USD × exchange rate */
function formatKrwFromUsdAmount(n: number): string {
  const won = Math.round(n);
  return `₩${won.toLocaleString("ko-KR")}`;
}

function parseUsdNumber(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * USD→KRW rate for displaying converted estimates on cards.
 * Set `EXPO_PUBLIC_USD_KRW_RATE` in `.env` (e.g. 1380) and restart Expo.
 */
export function getUsdToKrwRate(): number {
  const raw = process.env.EXPO_PUBLIC_USD_KRW_RATE;
  if (raw != null && String(raw).trim() !== "") {
    const n = parseFloat(String(raw).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1380;
}

/**
 * Rewrite USD-style amounts into approximate 원 using `usdToKrw` when:
 * - the UI locale is Korean (`labelLocale === "ko"`), or
 * - the line uses the Korean word "달러" (model often writes 달러 even if the user asked in English).
 * Converted amounts use the Korean won sign and grouping (e.g. 약 ₩62,100–₩75,900), from USD × `usdToKrw`.
 * Pure 원/KRW lines (no $ / 달러 / USD) are left unchanged.
 * English-only lines like `~$35–45 (5 lb)` stay in USD when `labelLocale === "en"` and there is no 달러.
 */
export function displayEstimatedPriceForLocale(
  raw: string,
  labelLocale: ChatReplyLocale,
  usdToKrw: number,
): string {
  if (!raw.trim()) return raw;

  const hasUsd = /\$|(?:^|\s)USD(?:\s|$)|달러|dollars?/i.test(raw);
  if (!hasUsd) return raw;

  const useKrw = labelLocale === "ko" || /달러/.test(raw);
  if (!useKrw) return raw;

  let out = raw;

  // ~$45–55 or $45-55 (two USD amounts)
  out = out.replace(
    /~?\s*\$\s*([\d,]+(?:\.\d+)?)\s*[–\-~]\s*\$?\s*([\d,]+(?:\.\d+)?)/gi,
    (full, a, b) => {
      const lo = parseUsdNumber(a) * usdToKrw;
      const hi = parseUsdNumber(b) * usdToKrw;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return full;
      return `약 ${formatKrwFromUsdAmount(lo)}–${formatKrwFromUsdAmount(hi)}`;
    },
  );

  // 45–55달러
  out = out.replace(
    /~?\s*([\d,]+(?:\.\d+)?)\s*[–\-~]\s*([\d,]+(?:\.\d+)?)\s*달러/gi,
    (full, a, b) => {
      const lo = parseUsdNumber(a) * usdToKrw;
      const hi = parseUsdNumber(b) * usdToKrw;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return full;
      return `약 ${formatKrwFromUsdAmount(lo)}–${formatKrwFromUsdAmount(hi)}`;
    },
  );

  // USD 45
  out = out.replace(/~?\s*USD\s*([\d,]+(?:\.\d+)?)/gi, (full, a) => {
    const v = parseUsdNumber(a) * usdToKrw;
    if (!Number.isFinite(v)) return full;
    return `약 ${formatKrwFromUsdAmount(v)}`;
  });

  // Single $40 (not part of a range — ranges already replaced)
  out = out.replace(
    /~?\s*\$\s*([\d,]+(?:\.\d+)?)(?=\s*[,(]|$)/gi,
    (full, a) => {
      const v = parseUsdNumber(a) * usdToKrw;
      if (!Number.isFinite(v)) return full;
      return `약 ${formatKrwFromUsdAmount(v)}`;
    },
  );

  // Single 40달러
  out = out.replace(/~?\s*([\d,]+(?:\.\d+)?)\s*달러/gi, (full, a) => {
    const v = parseUsdNumber(a) * usdToKrw;
    if (!Number.isFinite(v)) return full;
    return `약 ${formatKrwFromUsdAmount(v)}`;
  });

  out = out.replace(/약\s+약/g, "약");

  return out;
}

export function stripPriceEstimateWords(raw: string): string {
  if (!raw?.trim()) return raw;
  let s = raw;
  s = s.replace(/,\s*estimate\b/gi, "");
  s = s.replace(/,\s*추정/g, "");
  s = s.replace(/\s+estimate\b\s*\)/gi, ")");
  s = s.replace(/\s+추정\s*\)/g, ")");
  s = s.replace(/,\s*estimate\b\s*$/gi, "");
  s = s.replace(/,\s*추정\s*$/g, "");
  s = s.replace(/\s+estimate\b\s*$/gi, "");
  s = s.replace(/\s+추정\s*$/g, "");
  s = s.replace(/\(\s*estimate\s*\)/gi, "");
  s = s.replace(/\(\s*추정\s*\)/g, "");
  s = s.replace(/,\s*\)/g, ")");
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}
