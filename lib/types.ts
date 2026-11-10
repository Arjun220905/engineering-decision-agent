import { z } from "zod";

export const segmentSchema = z
  .object({
    id: z.string().min(1).max(100),
    speaker: z.string().min(1).max(120),
    start: z.number().finite().min(0).max(604800),
    end: z.number().finite().min(0).max(604800),
    text: z.string().min(1).max(12000),
  })
  .refine((s) => s.end >= s.start, "End must follow start");
export const decisionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  context: z.string().max(4000),
  rationale: z.string().max(4000),
  consequences: z.string().max(4000),
  evidence: z.array(z.string()).min(1).max(20),
  approved: z.boolean().default(false),
});
export const actionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  description: z.string().max(4000),
  owner: z.string().max(120),
  due: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Use a valid YYYY-MM-DD date",
    ),
  priority: z.enum(["High", "Medium", "Low"]),
  evidence: z.array(z.string()).min(1).max(20),
  approved: z.boolean().default(false),
  completed: z.boolean().default(false),
});
export const meetingSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    date: z.string().datetime(),
    project: z.string().max(100),
    platform: z.enum(["Google Meet", "Zoom", "Microsoft Teams", "Transcript"]),
    duration: z.number().finite().min(0).max(604800),
    summary: z.string().max(8000),
    segments: z.array(segmentSchema).min(1).max(5000),
    decisions: z.array(decisionSchema).max(100),
    actions: z.array(actionSchema).max(200),
    questions: z.array(z.string().max(1000)).max(100),
    source: z.enum(["sample", "import", "meetstream"]),
    extraction: z.enum(["sample", "rules", "ai"]),
    reviewed: z.boolean(),
    revision: z.number().int().min(0),
  })
  .superRefine((m, ctx) => {
    const ids = new Set(m.segments.map((s) => s.id));
    if (ids.size !== m.segments.length)
      ctx.addIssue({ code: "custom", message: "Segment IDs must be unique" });
    const outputIds = [...m.decisions, ...m.actions].map((x) => x.id);
    if (new Set(outputIds).size !== outputIds.length)
      ctx.addIssue({ code: "custom", message: "Output IDs must be unique" });
    for (const item of [...m.decisions, ...m.actions]) {
      if (item.evidence.some((id) => !ids.has(id)))
        ctx.addIssue({
          code: "custom",
          message: "Evidence must reference a transcript segment",
        });
      if (
        "owner" in item &&
        item.owner &&
        !m.segments.some((s) => s.speaker === item.owner)
      )
        ctx.addIssue({
          code: "custom",
          message: "Owner must be a meeting participant",
        });
    }
  });
export const extractionSchema = z.object({
  summary: z.string().max(8000),
  decisions: z.array(decisionSchema).max(100),
  actions: z.array(actionSchema).max(200),
  questions: z.array(z.string().max(1000)).max(100),
});
export type Meeting = z.infer<typeof meetingSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Destination = "linear" | "github" | "slack" | "notion";
export type Delivery = {
  id: string;
  meetingId: string;
  itemId: string;
  destination: Destination;
  status: "pending" | "sent" | "uncertain";
  url: string;
  error: string;
  createdAt: string;
};
export type IntegrationStatus = Record<
  Destination | "meetstream" | "ai",
  boolean
>;

export function time(seconds: number) {
  const n = Math.floor(seconds);
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
export function evidenceUrl(origin: string, m: Meeting, id: string) {
  return `${origin}/?meeting=${encodeURIComponent(m.id)}&segment=${encodeURIComponent(id)}`;
}
export function adrMarkdown(m: Meeting, d: Decision, origin: string) {
  return `# ${d.title}\n\nStatus: ${d.approved ? "Accepted" : "Proposed"}\nDate: ${m.date.slice(0, 10)}\nMeeting: ${m.title}\n\n## Context\n${d.context}\n\n## Decision\n${d.title}\n\n## Rationale\n${d.rationale}\n\n## Consequences\n${d.consequences}\n\n## Evidence\n${d.evidence
    .map((id) => {
      const s = m.segments.find((s) => s.id === id)!;
      return `- [${time(s.start)} · ${s.speaker}](${evidenceUrl(origin, m, id)}): “${s.text}”`;
    })
    .join("\n")}\n`;
}
export function summaryMarkdown(m: Meeting, origin: string) {
  return `# ${m.title}\n\n${m.summary}\n\n## Decisions\n${
    m.decisions
      .filter((d) => d.approved)
      .map(
        (d) =>
          `- ${d.title} ([evidence](${evidenceUrl(origin, m, d.evidence[0])}))`,
      )
      .join("\n") || "No approved decisions."
  }\n\n## Action items\n${
    m.actions
      .filter((a) => a.approved)
      .map(
        (a) =>
          `- ${a.title} — ${a.owner || "Unassigned"}${a.due ? ` · due ${a.due}` : ""} ([evidence](${evidenceUrl(origin, m, a.evidence[0])}))`,
      )
      .join("\n") || "No approved action items."
  }\n\n[Review meeting](${origin}/?meeting=${encodeURIComponent(m.id)})`;
}
