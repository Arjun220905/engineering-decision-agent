import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { globSync } from "node:fs";
const origin = process.env.TRACE_TEST_URL || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error("API checks only run against a local preview.");
let cookie = "";
async function request(path, method = "GET", body, extra = {}) {
  return fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("local API: authentication, duplicate import, optimistic concurrency and evidence validation", async () => {
  const unauth = await request("/api/meetings", "POST", {});
  assert.equal(unauth.status, 401);
  const login = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
    redirect: "manual",
  });
  cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  assert.ok(cookie, "local auth cookie");
  const transcript = `[00:12] Alex: We decided to use cursor pagination for test ${Date.now()}.\n[01:05] Sarah: I’ll write the specification.`;
  const input = {
    title: "API validation fixture",
    project: "Engineering",
    date: new Date().toISOString(),
    transcript,
    useAI: false,
  };
  const first = await request("/api/meetings", "POST", input);
  assert.equal(first.status, 201, await first.clone().text());
  const { meeting } = await first.json();
  const duplicate = await request("/api/meetings", "POST", input);
  assert.equal(duplicate.status, 200);
  const repeat = await duplicate.json();
  assert.equal(repeat.duplicate, true);
  assert.equal(repeat.meeting.id, meeting.id);
  const versions = await Promise.all([
    request("/api/meetings/" + meeting.id, "PUT", {
      ...meeting,
      title: "Version A",
    }),
    request("/api/meetings/" + meeting.id, "PUT", {
      ...meeting,
      title: "Version B",
    }),
  ]);
  assert.deepEqual(versions.map((r) => r.status).sort(), [200, 409]);
  const latest = await (await request("/api/workspace")).json();
  const saved = latest.meetings.find((m) => m.id === meeting.id);
  assert.equal(saved.revision, 1);
  const changedId = structuredClone(saved);
  changedId.actions[0].id = "new-identity";
  assert.equal(
    (await request("/api/meetings/" + meeting.id, "PUT", changedId)).status,
    400,
  );
  const invalid = structuredClone(saved);
  invalid.actions[0].evidence = ["invented"];
  assert.equal(
    (await request("/api/meetings/" + meeting.id, "PUT", invalid)).status,
    400,
  );
  assert.equal(
    (
      await request("/api/meetings/" + meeting.id, "PUT", saved, {
        Origin: "https://untrusted.test",
      })
    ).status,
    403,
  );
  const sample = latest.meetings.find((m) => m.source === "sample");
  assert.equal(
    (
      await request("/api/publish", "POST", {
        meetingId: sample.id,
        revision: sample.revision,
        destinations: ["slack"],
      })
    ).status,
    409,
  );
  cookie = "";
  assert.equal(
    (
      await request("/api/publish", "POST", {
        meetingId: meeting.id,
        revision: 1,
        destinations: ["linear"],
      })
    ).status,
    401,
  );
  // Local-only cleanup keeps validation fixtures out of the walkthrough workspace.
  for (const path of globSync(".wrangler/state/v3/d1/**/*.sqlite").filter(
    (p) => !p.endsWith("metadata.sqlite"),
  )) {
    const db = new DatabaseSync(path);
    try {
      db.prepare("DELETE FROM meetings WHERE id=? AND owner=?").run(
        meeting.id,
        "local_seedy",
      );
    } finally {
      db.close();
    }
  }
});
