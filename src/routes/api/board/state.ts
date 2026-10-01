import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { readBoardState, writeBoardState } from "@/lib/board-store.server";

function bearer(request: Request): string | undefined {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/board/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getSessionUser(bearer(request));
        if (!user) return json({ error: "Unauthorized" }, 401);
        return json(await readBoardState(user.id));
      },
      PUT: async ({ request }) => {
        const user = await getSessionUser(bearer(request));
        if (!user) return json({ error: "Unauthorized" }, 401);
        let body: { state?: unknown };
        try {
          body = (await request.json()) as { state?: unknown };
        } catch {
          return json({ error: "Ugyldigt indhold." }, 400);
        }
        const state = typeof body.state === "string" ? body.state : "";
        if (!state.startsWith("{")) return json({ error: "Scoreboardet kunne ikke læses." }, 400);
        try {
          return json(await writeBoardState(user.id, state));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Kunne ikke gemme.";
          return json({ error: message }, message.includes("lukket") ? 403 : 400);
        }
      },
    },
  },
});
