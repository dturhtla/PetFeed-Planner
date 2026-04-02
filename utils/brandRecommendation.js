const MARKER = "BRAND_JSON:";

/** Extract first complete `{ ... }` from a string that starts with `{`. */
function extractBalancedJson(s) {
  if (!s || !s.startsWith("{")) return null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return null;
}

function isValidBrand(data) {
  return (
    data &&
    typeof data.brandName === "string" &&
    (data.species === "dog" || data.species === "cat") &&
    Array.isArray(data.benefits) &&
    (data.productName === undefined || typeof data.productName === "string") &&
    (data.estimatedPrice === undefined || typeof data.estimatedPrice === "string")
  );
}

/**
 * Strips every `BRAND_JSON:{...}` block and returns clean caption + all parsed brands.
 * Handles multiple recommendations in one assistant message (multiple lines).
 */
export function parseBrandRecommendationsFromModelText(text) {
  if (!text || typeof text !== "string") {
    return { caption: text || "", brands: [] };
  }
  let caption = text;
  const brands = [];
  let guard = 0;
  while (guard++ < 100) {
    const idx = caption.indexOf(MARKER);
    if (idx === -1) break;
    const afterMarker = caption.slice(idx + MARKER.length);
    const trimmed = afterMarker.trimStart();
    const ws = afterMarker.length - trimmed.length;
    if (!trimmed.startsWith("{")) {
      caption = caption.slice(0, idx) + caption.slice(idx + MARKER.length);
      continue;
    }
    const jsonStr = extractBalancedJson(trimmed);
    if (!jsonStr) {
      caption = caption.slice(0, idx).trim();
      break;
    }
    try {
      const data = JSON.parse(jsonStr);
      if (isValidBrand(data)) {
        const entry = {
          brandName: data.brandName.trim(),
          species: data.species,
          benefits: data.benefits.filter((b) => typeof b === "string").map((b) => b.trim()),
        };
        if (typeof data.productName === "string" && data.productName.trim()) {
          entry.productName = data.productName.trim();
        }
        if (typeof data.estimatedPrice === "string" && data.estimatedPrice.trim()) {
          entry.estimatedPrice = data.estimatedPrice.trim();
        }
        brands.push(entry);
      }
    } catch {
      /* skip malformed */
    }
    const removeLen = MARKER.length + ws + jsonStr.length;
    caption = (caption.slice(0, idx) + caption.slice(idx + removeLen))
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return { caption: caption.trim(), brands };
}

/** @deprecated Prefer parseBrandRecommendationsFromModelText; returns first brand only */
export function parseBrandRecommendationFromModelText(text) {
  const { caption, brands } = parseBrandRecommendationsFromModelText(text);
  return { caption, brand: brands[0] ?? null };
}
