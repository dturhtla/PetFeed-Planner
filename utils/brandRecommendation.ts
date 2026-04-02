const MARKER = "BRAND_JSON:";

function extractBalancedJson(s: string): string | null {
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

function isValidBrand(data: unknown): data is {
  brandName: string;
  species: "dog" | "cat";
  benefits: string[];
  productName?: string;
  estimatedPrice?: string;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.brandName === "string" &&
    (d.species === "dog" || d.species === "cat") &&
    Array.isArray(d.benefits) &&
    (d.productName === undefined || typeof d.productName === "string") &&
    (d.estimatedPrice === undefined || typeof d.estimatedPrice === "string")
  );
}

export type ParsedBrand = {
  brandName: string;
  species: "dog" | "cat";
  benefits: string[];
  productName?: string;
  /** Approximate retail price (e.g. currency + pack size); model-generated estimate only */
  estimatedPrice?: string;
};

export function parseBrandRecommendationsFromModelText(text: string | null | undefined): {
  caption: string;
  brands: ParsedBrand[];
} {
  if (!text || typeof text !== "string") {
    return { caption: text || "", brands: [] };
  }
  let caption = text;
  const brands: ParsedBrand[] = [];
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
      // Truncated or unclosed JSON (e.g. hit token limit): never show raw BRAND_JSON to users
      caption = caption.slice(0, idx).trim();
      break;
    }
    try {
      const data: unknown = JSON.parse(jsonStr);
      if (isValidBrand(data)) {
        brands.push({
          brandName: data.brandName.trim(),
          species: data.species,
          benefits: data.benefits
            .filter((b): b is string => typeof b === "string")
            .map((b) => b.trim()),
          ...(typeof data.productName === "string" && data.productName.trim()
            ? { productName: data.productName.trim() }
            : {}),
          ...(typeof data.estimatedPrice === "string" && data.estimatedPrice.trim()
            ? { estimatedPrice: data.estimatedPrice.trim() }
            : {}),
        });
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
