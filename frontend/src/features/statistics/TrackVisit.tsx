"use client";

import { useEffect, useRef } from "react";
import { apiVoid, session } from "@/lib/api";

export function TrackVisit({ slug }: { slug: string }) {
  const event = useRef<{ slug: string; id: string } | null>(null);
  useEffect(() => {
    if (event.current?.slug !== slug) event.current = { slug, id: crypto.randomUUID() };
    const eventId = event.current.id;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function send(remaining: number) {
      try {
        const identity = await session();

        if (controller.signal.aborted) return;
        await apiVoid(
          "/public/portfolios/" + encodeURIComponent(slug) + "/visit",
          { method: "POST", signal: controller.signal, body: JSON.stringify({ eventId }) },
          identity.csrfToken,
        );
      } catch {
        // A failed statistic request must not interrupt reading; one retry keeps the same event ID.
        if (!controller.signal.aborted && remaining > 0)
          retry = setTimeout(() => void send(remaining - 1), 1500);
      }
    }

    void send(1);

    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [slug]);

  return null;
}
