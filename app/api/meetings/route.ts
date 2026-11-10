import { z } from "zod";
import {
  db,
  user,
  guard,
  body,
  failure,
  fingerprint,
  secret,
  HttpError,
} from "@/lib/server";
import { extract, parseTranscript } from "@/lib/extract";
import { meetingSchema } from "@/lib/types";
const input = z.object({
  title: z.string().trim().min(1).max(200),
  project: z.string().max(100).default("Engineering"),
  transcript: z.string().min(1).max(500000),
  date: z.string().datetime(),
  useAI: z.boolean().default(true),
});
export async function POST(req: Request) {
  try {
    guard(req);
    const owner = user(req);
    const parsed = input.safeParse(await body(req));
    if (!parsed.success)
      throw new HttpError(
        400,
        "Add a title, meeting date and a transcript under 500 KB.",
      );
    let segments;
    try {
      segments = parseTranscript(parsed.data.transcript);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const hash = await fingerprint(segments);
    const existing = await db()
      .prepare(
        "SELECT data,revision FROM meetings WHERE owner=? AND fingerprint=?",
      )
      .bind(owner, hash)
      .first<{ data: string; revision: number }>();
    if (existing)
      return Response.json({
        meeting: { ...JSON.parse(existing.data), revision: existing.revision },
        duplicate: true,
      });
    let output;
    try {
      output = await extract(
        segments,
        parsed.data.useAI ? secret("ANTHROPIC_API_KEY") : undefined,
        secret("ANTHROPIC_MODEL"),
      );
    } catch (e) {
      throw new HttpError(502, (e as Error).message);
    }
    const result = meetingSchema.safeParse({
      id: crypto.randomUUID(),
      ...parsed.data,
      ...output,
      segments,
      duration: Math.max(...segments.map((s) => s.end)),
      platform: "Transcript",
      source: "import",
      reviewed: false,
      revision: 0,
    });
    if (!result.success)
      throw new HttpError(
        502,
        "Extraction returned invalid evidence or owners. Retry with rule-based extraction.",
      );
    const m = result.data;
    const insert = await db()
      .prepare(
        "INSERT INTO meetings(id,owner,fingerprint,data,revision) VALUES(?,?,?,?,0) ON CONFLICT DO NOTHING",
      )
      .bind(m.id, owner, hash, JSON.stringify(m))
      .run();
    if (!insert.meta.changes) {
      const row = await db()
        .prepare(
          "SELECT data,revision FROM meetings WHERE owner=? AND fingerprint=?",
        )
        .bind(owner, hash)
        .first<{ data: string; revision: number }>();
      return Response.json({
        meeting: { ...JSON.parse(row!.data), revision: row!.revision },
        duplicate: true,
      });
    }
    return Response.json({ meeting: m, duplicate: false }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
