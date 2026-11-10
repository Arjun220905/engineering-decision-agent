import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { parseTranscript, extractRules, extract } from "../lib/extract.ts";
import { meetingSchema, adrMarkdown } from "../lib/types.ts";
import { sampleMeetings } from "../lib/sample.ts";
import {
  CLAIM_SQL,
  planDeliveries,
  preflight,
  deliver,
} from "../lib/publish.ts";

const m = structuredClone(sampleMeetings[0]);
test("imports MeetStream wire fields without losing speaker or evidence timestamps", () => {
  const s = parseTranscript(
    JSON.stringify({
      transcript: [
        {
          speaker: "Sarah Chen",
          start_time: 74.5,
          end_time: 80,
          transcript: "We decided to use Redis.",
        },
      ],
    }),
  );
  assert.deepEqual(s, [
    {
      id: "s1",
      speaker: "Sarah Chen",
      start: 74.5,
      end: 80,
      text: "We decided to use Redis.",
    },
  ]);
});
test("parses speaker turns and multiline content, rejects missing or invalid timestamps", () => {
  const s = parseTranscript(
    "[00:12] Alex: We decided to use cursors.\nKeep the ordering stable.\n[01:05] Sarah: I’ll write the specification.",
  );
  assert.equal(s[0].start, 12);
  assert.equal(s[0].end, 65);
  assert.match(s[0].text, /ordering/);
  for (const bad of [
    "Alex: no timestamp",
    "[00:99] Alex: bad",
    "[]",
    '[{"speaker":"A","transcript":"hi"}]',
  ])
    assert.throws(() => parseTranscript(bad));
});
test("rules extract explicit agreements and commitments, deduplicate repeats, leave deadlines empty", () => {
  const s = parseTranscript(
    "[00:12] Alex: We decided to use cursors.\n[00:25] Alex: We decided to use cursors.\n[01:05] Sarah: I’ll write the specification.\n[01:15] Alex: Should we split the rate limits?",
  );
  const result = extractRules(s);
  assert.equal(result.decisions.length, 1);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, "Sarah");
  assert.equal(result.actions[0].due, "");
  assert.equal(result.actions[0].approved, false);
  assert.equal(result.questions.length, 1);
});
test("schema rejects fabricated evidence, owners, invalid due dates and duplicate output IDs", () => {
  assert.equal(meetingSchema.safeParse(m).success, true);
  for (const patch of [
    { evidence: ["nonexistent"] },
    { owner: "Unknown person" },
    { due: "2026-02-30" },
    { id: "d1" },
  ]) {
    const bad = structuredClone(m);
    Object.assign(bad.actions[0], patch);
    assert.equal(meetingSchema.safeParse(bad).success, false);
  }
});
test("ADR includes rationale, consequences and exact evidence links", () => {
  const text = adrMarkdown(m, m.decisions[0], "https://trace.test");
  assert.match(text, /## Rationale/);
  assert.match(text, /## Consequences/);
  assert.match(text, /segment=s3/);
  assert.match(text, /03:24/);
  assert.match(text, /opaque, base64-encoded cursor/);
});
test("publishing plan includes only approved outputs, once per destination", () => {
  const draft = structuredClone(m);
  assert.equal(planDeliveries(draft, ["linear", "slack"]).length, 0);
  draft.actions[0].approved = true;
  draft.decisions[0].approved = true;
  assert.deepEqual(
    planDeliveries(draft, ["linear", "linear", "notion", "slack"]),
    [
      { itemId: "a1", destination: "linear" },
      { itemId: "d1", destination: "notion" },
      { itemId: "summary", destination: "slack" },
    ],
  );
  assert.throws(() => preflight(draft, ["linear"], {}), /Sample meetings/);
  draft.source = "import";
  assert.throws(() => preflight(draft, ["linear"], {}), /reviewed/);
  draft.reviewed = true;
  assert.throws(
    () =>
      preflight(draft, ["linear"], {
        LINEAR_API_KEY: "test",
        LINEAR_TEAM_ID: "team",
      }),
    /Map Sarah/,
  );
  assert.doesNotThrow(() =>
    preflight(draft, ["linear"], {
      LINEAR_API_KEY: "test",
      LINEAR_TEAM_ID: "team",
      LINEAR_ASSIGNEES: '{"Sarah Chen":"sarah-id"}',
    }),
  );
});
test("concurrent SQLite delivery claims permit exactly one external attempt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-ledger-"));
  const path = join(dir, "test.sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec(
      readFileSync(
        new URL("../drizzle/0000_fluffy_black_tom.sql", import.meta.url),
        "utf8",
      ),
    );
    const code = `const {DatabaseSync}=require('node:sqlite');const {workerData,parentPort}=require('node:worker_threads');const d=new DatabaseSync(workerData.path);d.exec('PRAGMA busy_timeout=5000');const r=d.prepare(workerData.sql).run(...workerData.params);parentPort.postMessage(Number(r.changes));d.close();`;
    const attempts = await Promise.all(
      Array.from(
        { length: 12 },
        (_, i) =>
          new Promise<number>((resolve, reject) => {
            const w = new Worker(code, {
              eval: true,
              workerData: {
                path,
                sql: CLAIM_SQL,
                params: [
                  "attempt-" + i,
                  "owner",
                  "meeting",
                  "a1",
                  "linear",
                  new Date().toISOString(),
                ],
              },
            });
            w.once("message", resolve);
            w.once("error", reject);
          }),
      ),
    );
    assert.equal(
      attempts.reduce((n, x) => n + x, 0),
      1,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM deliveries").get()!.count,
      1,
    );
    // A different destination or workspace is a different delivery.
    assert.equal(
      db
        .prepare(CLAIM_SQL)
        .run("github", "owner", "meeting", "a1", "github", "now").changes,
      1,
    );
    assert.equal(
      db
        .prepare(CLAIM_SQL)
        .run("other", "other-owner", "meeting", "a1", "linear", "now").changes,
      1,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Linear transport preserves explicit assignment and evidence; GraphQL errors never count as success", async () => {
  const original = globalThis.fetch;
  const draft = structuredClone(m);
  const config = {
    LINEAR_API_KEY: "test-key",
    LINEAR_TEAM_ID: "team",
    LINEAR_ASSIGNEES: '{"Sarah Chen":"sarah-id"}',
  };
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init!.body));
      assert.equal(request.variables.input.assigneeId, "sarah-id");
      assert.match(request.variables.input.description, /segment=s4/);
      return Response.json({
        data: {
          issueCreate: {
            success: true,
            issue: { url: "https://linear.app/test/issue/T-1" },
          },
        },
      });
    };
    assert.equal(
      await deliver(draft, "a1", "linear", "https://trace.test", config),
      "https://linear.app/test/issue/T-1",
    );
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ errors: [{ message: "Rejected" }] });
    };
    await assert.rejects(
      () => deliver(draft, "a1", "linear", "https://trace.test", config),
      /did not confirm/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("AI outputs cannot auto-approve drafts or override meeting identity", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: "malicious",
              summary: "A summary",
              decisions: [{ ...m.decisions[0], approved: true }],
              actions: [{ ...m.actions[0], approved: true, completed: true }],
              questions: [],
            }),
          },
        ],
      });
    const result = await extract(m.segments, "test-key");
    assert.equal(result.decisions[0].approved, false);
    assert.equal(result.actions[0].approved, false);
    assert.equal(result.actions[0].completed, false);
    assert.equal("id" in result, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("GitHub verifies assignees; Slack links evidence without accepting mention syntax; Notion includes ADR context", async () => {
  const original = globalThis.fetch;
  const draft = structuredClone(m);
  draft.actions[0].approved = true;
  draft.decisions[0].approved = true;
  draft.actions[0].title = "Review <!channel> and <@U123> handling";
  try {
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init!.body));
      assert.match(String(url), /github.com\/repos\/example\/repo\/issues/);
      assert.deepEqual(body.assignees, ["sarah"]);
      return Response.json({
        html_url: "https://github.com/example/repo/issues/1",
        assignees: [{ login: "sarah" }],
      });
    };
    const c = {
      GITHUB_TOKEN: "test",
      GITHUB_REPOSITORY: "example/repo",
      GITHUB_ASSIGNEES: '{"Sarah Chen":"sarah"}',
    };
    assert.match(
      await deliver(draft, "a1", "github", "https://trace.test", c),
      /issues\/1$/,
    );
    globalThis.fetch = async () =>
      Response.json({
        html_url: "https://github.com/example/repo/issues/2",
        assignees: [],
      });
    await assert.rejects(
      () => deliver(draft, "a1", "github", "https://trace.test", c),
      /did not confirm the assignee/,
    );
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      const text = JSON.stringify(body);
      assert.ok(!text.includes("<!channel>"));
      assert.ok(!text.includes("<@U123>"));
      assert.match(text, /&lt;!channel&gt;/);
      assert.match(
        text,
        /<https:\/\/trace.test\/\?meeting=.*segment=s4\|05:10 evidence>/,
      );
      assert.ok(body.blocks.length <= 50);
      return new Response("ok");
    };
    assert.equal(
      await deliver(draft, "summary", "slack", "https://trace.test", {
        SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/test",
      }),
      "",
    );
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      assert.equal(body.parent.page_id, "parent");
      assert.equal(
        body.properties.title.title[0].text.content,
        draft.decisions[0].title,
      );
      assert.match(JSON.stringify(body.children), /## Consequences/);
      return Response.json({ url: "https://notion.so/test-page" });
    };
    assert.equal(
      await deliver(draft, "d1", "notion", "https://trace.test", {
        NOTION_API_KEY: "test",
        NOTION_PARENT_PAGE_ID: "parent",
      }),
      "https://notion.so/test-page",
    );
  } finally {
    globalThis.fetch = original;
  }
});
