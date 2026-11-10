import { env } from "cloudflare:workers";
import {
  meetingSchema,
  type Meeting,
  type IntegrationStatus,
  type Delivery,
} from "./types";
export function db() {
  if (!env.DB) throw new Error("Database is not configured.");
  return env.DB;
}
export function secret(name: string): string {
  return (
    (env as unknown as Record<string, string>)[name] || process.env[name] || ""
  );
}
export function integrations(): IntegrationStatus {
  return {
    linear: !!(secret("LINEAR_API_KEY") && secret("LINEAR_TEAM_ID")),
    github: !!(secret("GITHUB_TOKEN") && secret("GITHUB_REPOSITORY")),
    slack: !!secret("SLACK_WEBHOOK_URL"),
    notion: !!(secret("NOTION_API_KEY") && secret("NOTION_PARENT_PAGE_ID")),
    meetstream: !!secret("MEETSTREAM_API_KEY"),
    ai: !!secret("ANTHROPIC_API_KEY"),
  };
}
export function user(req: Request): string {
  const id = req.headers.get("oai-authenticated-user-id");
  if (!id)
    throw new HttpError(401, "Sign in to save meetings and publish outputs.");
  return id;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function guard(req: Request) {
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new HttpError(403, "Cross-origin requests are not allowed.");
}
export async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 650000)
    throw new HttpError(413, "Request is too large.");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 650000) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request must be valid JSON.");
  }
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError)
    return Response.json({ error: "Invalid input." }, { status: 400 });
  console.error(error instanceof Error ? error.message : "Request failed");
  return Response.json(
    { error: "The request could not be completed. Please try again." },
    { status: 500 },
  );
}
export async function getMeeting(owner: string, id: string): Promise<Meeting> {
  const row = await db()
    .prepare("SELECT data,revision FROM meetings WHERE owner=? AND id=?")
    .bind(owner, id)
    .first<{ data: string; revision: number }>();
  if (!row) throw new HttpError(404, "Meeting not found.");
  return meetingSchema.parse({
    ...JSON.parse(row.data),
    revision: row.revision,
  });
}
export async function getDeliveries(owner: string): Promise<Delivery[]> {
  const rows = await db()
    .prepare(
      "SELECT id,meeting_id AS meetingId,item_id AS itemId,destination,status,url,error,created_at AS createdAt FROM deliveries WHERE owner=? ORDER BY created_at DESC",
    )
    .bind(owner)
    .all<Delivery>();
  return rows.results;
}
export async function fingerprint(segments: Meeting["segments"]) {
  const text = JSON.stringify(
    segments.map((s) => [
      s.speaker.trim().toLowerCase(),
      s.start,
      s.text.replace(/\s+/g, " ").trim().toLowerCase(),
    ]),
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
