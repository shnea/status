import { z } from "zod";

const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().startsWith("/@"),
});

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  sources: z.array(sourceSchema).optional(),
  cancelled: z.boolean().optional(),
});

const conversationSchema = z.object({
  version: z.literal(1),
  opened: z.boolean(),
  question: z.string().max(2000),
  messages: z.array(messageSchema),
  pending: z.string().uuid().nullable(),
  cancelled: z.array(z.string().uuid()),
});

export type Source = z.infer<typeof sourceSchema>;

export type Message = z.infer<typeof messageSchema>;

export type Conversation = z.infer<typeof conversationSchema>;

export async function conversationKey(portfolioId: string, csrfToken: string): Promise<string> {
  // Bind tab-local history to this visitor session without storing its CSRF credential.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrfToken));

  const sessionId = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return "status-ai:" + portfolioId + ":" + sessionId;
}

export function readConversation(key: string): Conversation | null {
  try {
    const prefix = key.slice(0, key.lastIndexOf(":") + 1);

    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const previous = sessionStorage.key(index);

      if (previous?.startsWith(prefix) && previous !== key) sessionStorage.removeItem(previous);
    }

    const raw = sessionStorage.getItem(key);

    if (!raw || raw.length > 3 * 1024 * 1024) return null;
    const parsed = conversationSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveConversation(key: string, conversation: Conversation): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(conversation));
  } catch {
    // Browser storage may be disabled or full; the current in-memory conversation still works.
  }
}
