import {
  db,
  user,
  guard,
  body,
  failure,
  getMeeting,
  HttpError,
} from "@/lib/server";
import { meetingSchema } from "@/lib/types";
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    guard(req);
    const owner = user(req);
    const { id } = await params;
    const current = await getMeeting(owner, id);
    const result = meetingSchema.safeParse(await body(req));
    if (!result.success)
      throw new HttpError(
        400,
        "Draft is invalid. Check the owners and evidence links.",
      );
    const m = result.data;
    if (
      m.id !== id ||
      JSON.stringify(m.segments) !== JSON.stringify(current.segments) ||
      m.source !== current.source
    )
      throw new HttpError(
        400,
        "Transcript and source metadata cannot be changed during review.",
      );
    const ids = (items: { id: string }[]) =>
      items
        .map((x) => x.id)
        .sort()
        .join("\n");
    if (
      ids(m.actions) !== ids(current.actions) ||
      ids(m.decisions) !== ids(current.decisions)
    )
      throw new HttpError(
        400,
        "Output identities cannot be changed during review.",
      );
    const next = { ...m, revision: m.revision + 1 };
    const update = await db()
      .prepare(
        "UPDATE meetings SET data=?,revision=? WHERE id=? AND owner=? AND revision=?",
      )
      .bind(JSON.stringify(next), next.revision, id, owner, m.revision)
      .run();
    if (!update.meta.changes)
      throw new HttpError(
        409,
        "This meeting was updated elsewhere. Reload before saving your changes.",
      );
    return Response.json({ meeting: next });
  } catch (e) {
    return failure(e);
  }
}
