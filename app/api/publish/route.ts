import { z } from "zod";
import {
  db,
  user,
  guard,
  body,
  failure,
  getMeeting,
  getDeliveries,
  secret,
  HttpError,
} from "@/lib/server";
import { CLAIM_SQL, planDeliveries, preflight, deliver } from "@/lib/publish";
const input = z.object({
  meetingId: z.string().min(1).max(100),
  revision: z.number().int(),
  destinations: z
    .array(z.enum(["linear", "github", "slack", "notion"]))
    .min(1)
    .max(4),
});
export async function POST(req: Request) {
  try {
    guard(req);
    const owner = user(req);
    const p = input.safeParse(await body(req));
    if (!p.success)
      throw new HttpError(
        400,
        "Select a meeting and at least one destination.",
      );
    const m = await getMeeting(owner, p.data.meetingId);
    if (m.revision !== p.data.revision)
      throw new HttpError(
        409,
        "The meeting changed. Reload and review the latest draft before publishing.",
      );
    const c = Object.fromEntries(
      [
        "LINEAR_API_KEY",
        "LINEAR_TEAM_ID",
        "LINEAR_ASSIGNEES",
        "GITHUB_TOKEN",
        "GITHUB_REPOSITORY",
        "GITHUB_ASSIGNEES",
        "SLACK_WEBHOOK_URL",
        "NOTION_API_KEY",
        "NOTION_PARENT_PAGE_ID",
      ].map((k) => [k, secret(k)]),
    );
    try {
      preflight(m, p.data.destinations, c);
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
    let sent = 0,
      skipped = 0;
    for (const item of planDeliveries(m, p.data.destinations)) {
      const id = crypto.randomUUID();
      const claim = await db()
        .prepare(CLAIM_SQL)
        .bind(
          id,
          owner,
          m.id,
          item.itemId,
          item.destination,
          new Date().toISOString(),
        )
        .run();
      if (!claim.meta.changes) {
        skipped++;
        continue;
      }
      try {
        const url = await deliver(
          m,
          item.itemId,
          item.destination,
          new URL(req.url).origin,
          c,
        );
        await db()
          .prepare(
            "UPDATE deliveries SET status='sent',url=? WHERE id=? AND owner=?",
          )
          .bind(url, id, owner)
          .run();
        sent++;
      } catch (e) {
        await db()
          .prepare(
            "UPDATE deliveries SET status='uncertain',error=? WHERE id=? AND owner=?",
          )
          .bind((e as Error).message.slice(0, 500), id, owner)
          .run();
      }
    }
    return Response.json({
      sent,
      skipped,
      deliveries: await getDeliveries(owner),
    });
  } catch (e) {
    return failure(e);
  }
}
