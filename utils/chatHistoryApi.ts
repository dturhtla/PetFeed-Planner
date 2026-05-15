import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { ChatReplyLocale } from "./chatLocale";
import { inferUserMessageLocale } from "./chatLocale";

/** OpenAPI basePath from backend Swagger (see /swagger/doc.json). */
const CHAT_API_PREFIX = "/api/v1";

export type ServerChatLog = {
  role?: string;
  message?: string;
};

type SaveTurnBody = {
  user_id: number;
  user_message: string;
  ai_message: string;
};

function trimTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

/** Public origin only, e.g. https://xxx.ngrok-free.dev (no /api/v1). */
export function getChatApiOrigin(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_CHAT_API_URL || "").trim();
  const extra = Constants.expoConfig?.extra as
    | { chatApiUrl?: string }
    | undefined;
  const fromExtra =
    typeof extra?.chatApiUrl === "string" ? extra.chatApiUrl.trim() : "";
  return trimTrailingSlash(fromEnv || fromExtra);
}

/**
 * Backend `user_id` (integer). Order:
 * 1) `serverUserId` on `loggedInUser` (from `/auth/register` on signup/login)
 * 2) `EXPO_PUBLIC_CHAT_USER_ID` / `extra.chatUserId` (dev fallback)
 */
export async function resolveChatBackendUserId(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem("loggedInUser");
    if (raw) {
      const u = JSON.parse(raw) as { serverUserId?: unknown };
      if (typeof u.serverUserId === "number" && u.serverUserId > 0) {
        return u.serverUserId;
      }
    }
  } catch {
    /* ignore */
  }

  const envRaw = (process.env.EXPO_PUBLIC_CHAT_USER_ID || "").trim();
  const envId = parseInt(envRaw, 10);
  if (Number.isFinite(envId) && envId > 0) return envId;

  const extra = Constants.expoConfig?.extra as
    | { chatUserId?: string }
    | undefined;
  const extraRaw =
    typeof extra?.chatUserId === "string" ? extra.chatUserId.trim() : "";
  const extraId = parseInt(extraRaw, 10);
  if (Number.isFinite(extraId) && extraId > 0) return extraId;

  return null;
}

function chatHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "1",
  };
}

/** Response from `POST /api/v1/auth/register`. */
export type BackendRegisterResponse = {
  user_id?: number;
  email?: string;
  message?: string;
  error?: string;
};

/**
 * Registers email/password on the backend; returns `user_id` for chat APIs.
 * Use after local signup, or on first login if `serverUserId` is missing.
 */
export async function registerUserOnBackend(input: {
  email: string;
  password: string;
}):
  | { ok: true; userId: number }
  | { ok: false; status: number; message: string } {
  const origin = getChatApiOrigin();
  if (!origin) {
    return {
      ok: false,
      status: 0,
      message: "EXPO_PUBLIC_CHAT_API_URL is not set",
    };
  }

  const url = `${origin}${CHAT_API_PREFIX}/auth/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: chatHeaders(),
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    }),
  });

  let data: BackendRegisterResponse = {};
  try {
    data = (await res.json()) as BackendRegisterResponse;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const msg =
      typeof data.error === "string" && data.error.length > 0
        ? data.error
        : res.statusText || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  const rawId = data.user_id;
  const userId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string"
        ? parseInt(rawId, 10)
        : NaN;
  if (!Number.isFinite(userId) || userId <= 0) {
    return {
      ok: false,
      status: res.status,
      message: "Server response missing user_id",
    };
  }

  return { ok: true, userId };
}

export async function fetchChatHistoryFromServer(
  userId: number,
): Promise<ServerChatLog[]> {
  const origin = getChatApiOrigin();
  if (!origin) return [];

  const url = `${origin}${CHAT_API_PREFIX}/chat/history/${userId}`;
  const res = await fetch(url, { headers: chatHeaders() });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Chat history ${res.status}: ${t || res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as ServerChatLog[]) : [];
}

export async function saveChatTurnToServer(input: {
  userId: number;
  userMessage: string;
  aiMessage: string;
}): Promise<void> {
  const origin = getChatApiOrigin();
  if (!origin) return;

  const body: SaveTurnBody = {
    user_id: input.userId,
    user_message: input.userMessage,
    ai_message: input.aiMessage,
  };

  const url = `${origin}${CHAT_API_PREFIX}/chat/save-turn`;
  const res = await fetch(url, {
    method: "POST",
    headers: chatHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`save-turn ${res.status}: ${t || res.statusText}`);
  }
}

export type HydratedChatRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  replyLocale?: ChatReplyLocale;
};

export function mapServerChatLogsToMessages(
  logs: ServerChatLog[],
  genId: () => string,
): HydratedChatRow[] {
  let lastUserText = "";
  const out: HydratedChatRow[] = [];

  for (const row of logs) {
    const role = (row.role || "").toLowerCase();
    const message = row.message ?? "";
    if (role === "user") {
      lastUserText = message;
      out.push({ id: genId(), role: "user", content: message });
    } else if (role === "assistant" || role === "model") {
      const replyLocale = inferUserMessageLocale(lastUserText);
      out.push({
        id: genId(),
        role: "assistant",
        content: message,
        replyLocale,
      });
    }
  }
  return out;
}
