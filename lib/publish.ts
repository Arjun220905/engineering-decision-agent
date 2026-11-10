import {
  adrMarkdown,
  evidenceUrl,
  time,
  type Destination,
  type Meeting,
} from "./types.ts";
export const CLAIM_SQL =
  "INSERT INTO deliveries(id,owner,meeting_id,item_id,destination,status,url,error,created_at) VALUES(?,?,?,?,?,'pending','','',?) ON CONFLICT DO NOTHING";
export function planDeliveries(m: Meeting, destinations: Destination[]) {
  const plan: { itemId: string; destination: Destination }[] = [];
  for (const destination of new Set(destinations)) {
    if (destination === "linear" || destination === "github")
      for (const a of m.actions.filter((a) => a.approved))
        plan.push({ itemId: a.id, destination });
    if (destination === "notion")
      for (const d of m.decisions.filter((d) => d.approved))
        plan.push({ itemId: d.id, destination });
    if (
      destination === "slack" &&
      [...m.decisions, ...m.actions].some((x) => x.approved)
    )
      plan.push({ itemId: "summary", destination });
  }
  return plan;
}
export function slackPayload(m: Meeting, origin: string) {
  const escape = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const link = (id: string) =>
    `<${evidenceUrl(origin, m, id)}|${time(m.segments.find((s) => s.id === id)!.start)} evidence>`;
  const lines = [
    "*Decisions*",
    ...m.decisions
      .filter((d) => d.approved)
      .map((d) => `• ${escape(d.title)} · ${link(d.evidence[0])}`),
    "",
    "*Action items*",
    ...m.actions
      .filter((a) => a.approved)
      .map(
        (a) =>
          `• ${escape(a.title)} — ${escape(a.owner || "Unassigned")}${a.due ? ` · due ${a.due}` : ""} · ${link(a.evidence[0])}`,
      ),
  ];
  const chunks: string[] = [];
  let chunk = "";
  for (const line of lines) {
    if (chunk.length + line.length + 1 > 2800) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += (chunk ? "\n" : "") + line;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > 47)
    throw new Error(
      "This Slack summary is too large. Approve fewer outputs or export the meeting instead.",
    );
  return {
    text: "Reviewed engineering meeting",
    link_names: false,
    unfurl_links: false,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: m.title.slice(0, 150), emoji: false },
      },
      {
        type: "section",
        text: {
          type: "plain_text",
          text: m.summary.slice(0, 1800) || "Reviewed meeting outputs",
          emoji: false,
        },
      },
      ...chunks.map((text) => ({
        type: "section",
        text: { type: "mrkdwn", text, verbatim: true },
      })),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${origin}/?meeting=${encodeURIComponent(m.id)}|Review meeting> · trace:${m.id}:summary:slack`,
          },
        ],
      },
    ],
  };
}
export function assignee(mapping: string, name: string) {
  let parsed;
  try {
    parsed = JSON.parse(mapping || "{}");
  } catch {
    throw new Error("The server owner mapping is invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Owner mappings must be a JSON object.");
  const id = parsed[name];
  if (typeof id !== "string" || !id.trim())
    throw new Error(
      `Map ${name} to an account in the integration settings before publishing.`,
    );
  return id;
}
export function preflight(
  m: Meeting,
  destinations: Destination[],
  config: Record<string, string>,
) {
  if (m.source === "sample")
    throw new Error(
      "Sample meetings stay in Trace. Import a real transcript to publish to your tools.",
    );
  if (!m.reviewed)
    throw new Error("Mark this meeting reviewed before publishing.");
  const actions = m.actions.filter((a) => a.approved);
  for (const dest of destinations) {
    if (
      (dest === "linear" || dest === "github") &&
      actions.some((a) => !a.owner)
    )
      throw new Error("Assign every approved action item before publishing.");
    if (dest === "linear") {
      if (!config.LINEAR_API_KEY || !config.LINEAR_TEAM_ID)
        throw new Error("Connect Linear first.");
      actions.forEach((a) => assignee(config.LINEAR_ASSIGNEES, a.owner));
    }
    if (dest === "github") {
      if (
        !config.GITHUB_TOKEN ||
        !/^[-\w.]+\/[-\w.]+$/.test(config.GITHUB_REPOSITORY || "")
      )
        throw new Error("Connect a valid GitHub repository first.");
      actions.forEach((a) => assignee(config.GITHUB_ASSIGNEES, a.owner));
    }
    if (
      dest === "slack" &&
      !/^https:\/\/hooks\.slack\.com\/services\//.test(
        config.SLACK_WEBHOOK_URL || "",
      )
    )
      throw new Error("Connect a Slack incoming webhook first.");
    if (
      dest === "notion" &&
      (!config.NOTION_API_KEY || !config.NOTION_PARENT_PAGE_ID)
    )
      throw new Error("Connect Notion first.");
  }
  if (destinations.includes("slack")) slackPayload(m, "https://trace.example");
  if (!planDeliveries(m, destinations).length)
    throw new Error(
      "Approve at least one output for the selected destinations.",
    );
}
async function request(url: string, init: RequestInit) {
  // ponytail: no automatic retries for external writes. Ambiguous outcomes require reconciliation.
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  if (!r.ok)
    throw new Error(
      `The destination returned HTTP ${r.status}. Check the destination before attempting any manual reconciliation.`,
    );
  return r;
}
export async function deliver(
  m: Meeting,
  itemId: string,
  destination: Destination,
  origin: string,
  c: Record<string, string>,
): Promise<string> {
  const marker = `trace:${m.id}:${itemId}:${destination}`;
  if (destination === "linear" || destination === "github") {
    const a = m.actions.find((a) => a.id === itemId)!;
    const body = `${a.description}\n\nOwner: ${a.owner}${a.due ? `\nDue: ${a.due}` : ""}\n\n## Evidence\n${a.evidence
      .map((id) => {
        const s = m.segments.find((s) => s.id === id)!;
        return `- [${s.speaker}](${evidenceUrl(origin, m, id)}): ${s.text}`;
      })
      .join("\n")}\n\n${marker}`;
    if (destination === "linear") {
      const issue = {
        teamId: c.LINEAR_TEAM_ID,
        assigneeId: assignee(c.LINEAR_ASSIGNEES, a.owner),
        title: a.title,
        description: body,
        priority: a.priority === "High" ? 2 : a.priority === "Medium" ? 3 : 4,
        ...(a.due ? { dueDate: a.due } : {}),
      };
      const r = await request("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: c.LINEAR_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query:
            "mutation CreateIssue($input:IssueCreateInput!){issueCreate(input:$input){success issue{id url}}}",
          variables: { input: issue },
        }),
      });
      const data = (await r.json()) as {
        errors?: unknown[];
        data?: { issueCreate?: { success: boolean; issue?: { url: string } } };
      };
      if (
        data.errors?.length ||
        !data.data?.issueCreate?.success ||
        !data.data.issueCreate.issue?.url
      )
        throw new Error(
          "Linear did not confirm issue creation. Check Linear for the Trace marker before reconciling.",
        );
      return data.data.issueCreate.issue.url;
    }
    const r = await request(
      `https://api.github.com/repos/${c.GITHUB_REPOSITORY}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Trace-Decision-Agent",
        },
        body: JSON.stringify({
          title: a.title,
          body,
          assignees: [assignee(c.GITHUB_ASSIGNEES, a.owner)],
        }),
      },
    );
    const data = (await r.json()) as {
      html_url: string;
      assignees?: { login: string }[];
    };
    if (!data.html_url)
      throw new Error(
        "GitHub did not return an issue URL. Reconcile before retrying.",
      );
    if (
      !data.assignees?.some(
        (x) =>
          x.login.toLowerCase() ===
          assignee(c.GITHUB_ASSIGNEES, a.owner).toLowerCase(),
      )
    )
      throw new Error(
        "GitHub created the issue but did not confirm the assignee. Check the repository and reconcile the delivery.",
      );
    return data.html_url;
  }
  if (destination === "slack") {
    // Escape Slack control syntax; only evidence links constructed here can become links.
    const response = await request(c.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload(m, origin)),
    });
    if ((await response.text()).trim() !== "ok")
      throw new Error(
        "Slack did not confirm the summary. Check the channel before reconciling.",
      );
    return "";
  }
  const d = m.decisions.find((d) => d.id === itemId)!;
  const markdown = adrMarkdown(m, d, origin);
  const chunks = markdown.match(/[\s\S]{1,1800}/g) || [];
  const r = await request("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { page_id: c.NOTION_PARENT_PAGE_ID },
      properties: {
        title: {
          type: "title",
          title: [{ type: "text", text: { content: d.title } }],
        },
      },
      children: [
        ...chunks.map((text) => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: text } }] },
        })),
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: marker } }],
          },
        },
      ],
    }),
  });
  const data = (await r.json()) as { url: string };
  if (!data.url)
    throw new Error(
      "Notion did not return a page URL. Reconcile before retrying.",
    );
  return data.url;
}
