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

/** Placeholder in Gemini chat history when the UI showed an image-only user bubble. */
export function userPhotoHistoryPlaceholder(
  replyLocale: ChatReplyLocale,
): string {
  if (replyLocale === "en") {
    return (
      "[User shared a pet photo in the chat. Your very next reply in this thread was your " +
      "visual analysis of that image — use that analysis when they ask follow-up questions about the photo.]"
    );
  }
  return (
    "[사용자가 반려동물 사진을 채팅에 공유했습니다. 바로 다음 답변이 그 사진에 대한 시각 분석입니다. " +
    "사진에 대한 후속 질문에는 그 분석 내용을 활용하세요.]"
  );
}

/** True when the user is likely referring to a photo they already shared in this chat. */
export function messageReferencesRecentPhoto(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const en =
    /\b(this|my|the|that)\s+(photo|picture|image|pic)\b/.test(lower) ||
    /\b(photo|picture|image)\b.*\b(cat|dog|pet|rabbit|animal)\b/.test(lower) ||
    /\b(cat|dog|pet)\b.*\b(photo|picture|image)\b/.test(lower) ||
    /\bwhat\b.*\b(breed|species|age)\b/.test(lower) ||
    /\b(in|from)\s+(this|the)\s+(photo|picture|image)\b/.test(lower);
  const ko =
    /사진/.test(t) ||
    /이\s*사진/.test(t) ||
    /내\s*(고양이|강아지|반려|펫|토끼)/.test(t) ||
    /품종|종류|나이/.test(t);
  return en || ko;
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
