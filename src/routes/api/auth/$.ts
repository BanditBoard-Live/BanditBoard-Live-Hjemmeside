import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

const noDatabase =
  Boolean(process.env.VERCEL) && !process.env.DATABASE_URL?.trim();

function unavailable() {
  return Response.json(
    {
      message:
        "Databasen er ikke sat op. Tilføj DATABASE_URL i Vercel og udgiv igen.",
    },
    { status: 503 },
  );
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => (noDatabase ? unavailable() : auth.handler(request)),
      POST: ({ request }) => (noDatabase ? unavailable() : auth.handler(request)),
    },
  },
});

