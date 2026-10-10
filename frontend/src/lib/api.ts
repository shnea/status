import type { SessionView } from "@/features/portfolio/model";

interface ErrorResponse {
  message?: string;
  code?: string;
}

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

// Bind recovered tokens to the identity that received the original token.
const csrfMembers = new Map<string, string | null>();

async function request(
  path: string,
  init: RequestInit,
  csrfToken?: string,
  recoverCsrf = true,
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (csrfToken) headers.set("X-CSRF-TOKEN", csrfToken);

  const response = await fetch("/api" + path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "요청을 처리하지 못했습니다.";
    let code: string | undefined;

    try {
      const error: ErrorResponse = await response.json();
      message = error.message || message;
      code = error.code;
    } catch {
      message = response.status === 401 ? "로그인이 필요합니다." : message;
    }

    if (
      response.status === 403 &&
      code === "CSRF_TOKEN_INVALID" &&
      csrfToken &&
      recoverCsrf &&
      csrfMembers.has(csrfToken)
    ) {
      const expectedMember = csrfMembers.get(csrfToken);
      const current = await session(init.signal ?? undefined);

      if ((current.member?.id ?? null) !== expectedMember)
        throw new ApiFailure(
          401,
          "로그인 계정이 변경되었습니다. 작성 중인 내용을 보존한 뒤 다시 로그인해주세요.",
        );

      if (current.member?.suspended) throw new ApiFailure(403, "이용이 정지된 계정입니다.");

      // The CSRF filter rejected the request before its action ran; retry exactly once.
      return request(path, init, current.csrfToken, false);
    }

    throw new ApiFailure(response.status, message, code);
  }

  return response;
}

export async function api<T>(path: string, init: RequestInit = {}, csrfToken?: string): Promise<T> {
  const response = await request(path, init, csrfToken);

  return response.json();
}

export async function apiVoid(path: string, init: RequestInit, csrfToken: string): Promise<void> {
  await request(path, init, csrfToken);
}

export async function session(signal?: AbortSignal): Promise<SessionView> {
  const current = await api<SessionView>("/session", { signal });
  csrfMembers.set(current.csrfToken, current.member?.id ?? null);

  if (csrfMembers.size > 8) {
    const oldest = csrfMembers.keys().next().value;

    if (oldest) csrfMembers.delete(oldest);
  }

  return current;
}

export async function apiBlob(path: string, init: RequestInit, csrfToken: string): Promise<Blob> {
  const response = await request(path, init, csrfToken);

  if (!response.headers.get("content-type")?.startsWith("application/pdf"))
    throw new ApiFailure(503, "PDF를 생성하지 못했습니다.");

  return response.blob();
}
