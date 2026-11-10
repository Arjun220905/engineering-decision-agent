import { db, user, integrations, failure, getDeliveries } from "@/lib/server";
import { sampleMeetings } from "@/lib/sample";
import type { Meeting } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const owner = user(req);
    // Seed fictional examples once. Their explicit source label survives every edit.
    await db().batch(
      sampleMeetings.map((m) =>
        db()
          .prepare(
            "INSERT INTO meetings(id,owner,fingerprint,data,revision) VALUES(?,?,?,?,0) ON CONFLICT DO NOTHING",
          )
          .bind(
            `${owner}:${m.id}`,
            owner,
            `sample:${m.id}`,
            JSON.stringify({ ...m, id: `${owner}:${m.id}` }),
          ),
      ),
    );
    const rows = await db()
      .prepare("SELECT data,revision FROM meetings WHERE owner=?")
      .bind(owner)
      .all<{ data: string; revision: number }>();
    return Response.json(
      {
        meetings: rows.results
          .map(
            (r) => ({ ...JSON.parse(r.data), revision: r.revision }) as Meeting,
          )
          .sort((a, b) => b.date.localeCompare(a.date)),
        deliveries: await getDeliveries(owner),
        integrations: integrations(),
        signedIn: true,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401)
      return Response.json(
        {
          meetings: sampleMeetings,
          deliveries: [],
          integrations: integrations(),
          signedIn: false,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    return failure(error);
  }
}
