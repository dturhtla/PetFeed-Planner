export type ChatReplyLocale = "en" | "ko";

/**
 * Infer whether the user is writing primarily in Korean or English (for UI labels on cards, etc.).
 */
export function inferUserMessageLocale(s: string): ChatReplyLocale {
  const t = s.trim();
  if (!t) return "ko";
  const hangul = (t.match(/[\u3131-\u318E\uAC00-\uD7A3]/g) || []).length;
  const latin = (t.match(/[a-zA-Z]/g) || []).length;
  if (hangul === 0 && latin === 0) return "ko";
  return hangul > latin ? "ko" : "en";
}

/**
 * Prepends a strict language hint for the model API only (UI should still show `text` unchanged).
 */
export function wrapUserMessageForModelLanguage(
  text: string,
  replyLocale: ChatReplyLocale,
): string {
  if (replyLocale === "en") {
    return (
      "[Reply in English only for this turn: the entire answer—headings, lists, prices, notes—must be English. " +
      "Do not use Korean/Hangul except unavoidable characters inside a brand name.]\n\n" +
      text
    );
  }
  return (
    "[Reply in Korean only for this turn: the entire answer—headings, lists, prices, notes—must be Korean. " +
    "English is allowed only for brand/product names where usual.]\n\n" +
    text
  );
}

/** Appended to pet-image vision systemInstruction so replies match the user's text-chat language. */
export function visionAnalysisLanguageSuffix(
  replyLocale: ChatReplyLocale,
): string {
  if (replyLocale === "ko") {
    return (
      "\n\nLanguage (required): Match the user's chat language — Korean. " +
      "The entire reply must be in Korean only. Do not use English except unavoidable words on product packaging."
    );
  }
  return (
    "\n\nLanguage (required): Match the user's chat language — English. " +
    "The entire reply must be in English only."
  );
}

/** User text part paired with an image in the vision API. */
export function visionAnalysisUserPrompt(
  replyLocale: ChatReplyLocale,
): string {
  if (replyLocale === "ko") {
    return "이 이미지를 분석해 주세요. 시스템 지침을 따르고 반드시 한국어로만 답변하세요.";
  }
  return "Analyze this image. Follow the system instructions and reply in English only.";
}

/**
 * Puts "1. …" on the next line when it was on the same line as the intro (single newline, no extra blank line).
 */
export function fixGluedNumberedListStarts(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(/([0-9]*[가-힣]+)\.\s+(1\.\s)/g, "$1.\n$2");
  s = s.replace(/([0-9]*[a-zA-Z]{3,})\.\s+(1\.\s)/gi, "$1.\n$2");
  s = s.replace(/([0-9]*[가-힣]+)\.(1\.\s)/g, "$1.\n$2");
  s = s.replace(/([0-9]*[a-zA-Z]{3,})\.(1\.\s)/gi, "$1.\n$2");
  // English often uses "intro: 1. First item" (colon before the list, not a period)
  s = s.replace(/:\s+(1\.\s)/g, ":\n$1");
  s = s.replace(/:(1\.\s)/g, ":\n$1");
  return s;
}
