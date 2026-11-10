import { z } from "zod";
import { guard, user, body, secret, HttpError, failure } from "@/lib/server";
const input = z.object({
  transcriptId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export async function POST(req: Request) {
  try {
    guard(req);
    user(req);
    const p = input.safeParse(await body(req));
    if (!p.success)
      throw new HttpError(400, "Enter a valid MeetStream transcript ID.");
    const key = secret("MEETSTREAM_API_KEY");
    if (!key)
      throw new HttpError(
        409,
        "Configure MEETSTREAM_API_KEY on the server first.",
      );
    const r = await fetch(
      `https://api.meetstream.ai/api/v1/transcript/${encodeURIComponent(p.data.transcriptId)}/get_transcript?raw=false`,
      {
        headers: { Authorization: `Token ${key}` },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (r.status === 202)
      throw new HttpError(
        409,
        "The transcript is still processing. Try again after MeetStream finishes transcription.",
      );
    if (!r.ok)
      throw new HttpError(
        502,
        `MeetStream could not return this transcript (${r.status}). Check the ID and API key.`,
      );
    const data = await r.json();
    return Response.json({ transcript: JSON.stringify(data) });
  } catch (e) {
    return failure(e);
  }
}
