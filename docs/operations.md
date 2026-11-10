# Deployment and operations

## Sites

The reference runs as a Cloudflare Worker with a `DB` D1 binding, declared in `.openai/hosting.json`. The build entry point is `npm run build`, producing `dist/server/index.js` and its assets. Sites publishing provisions D1 and applies the committed Drizzle migration. Configure production secrets in Sites; local `.dev.vars` files are intentionally ignored.

Keep the Site private unless you add a deliberate membership model. Hosted authentication is owned by Sites, and every stored record and delivery is scoped to `oai-authenticated-user-id`. The root UI can show fictional samples to an anonymous request; every write requires authenticated identity. Cross-origin state-changing requests are rejected. The local sign-in shim is absent from production builds.

## Independent Cloudflare deployment

1. Create a Cloudflare D1 database for your fork.
2. Build the app with `npm run build`.
3. Copy `dist/server/wrangler.json` to a deployment config in the same directory and replace its D1 database ID with your database ID. Preserve the generated main and asset paths.
4. Apply `drizzle/0000_fluffy_black_tom.sql` to that database with Wrangler’s `d1 execute --remote --file` command.
5. Configure the secrets listed in `.env.example` with Wrangler secrets.
6. Put the Worker behind a trusted identity gateway that **strips client-supplied identity headers and injects a validated, stable `oai-authenticated-user-id`**. The app consumes this identity; it does not implement its own production login. Do not expose an ungated Worker that trusts arbitrary inbound identity headers.
7. Deploy with Wrangler using your deployment config.

The Sites deployment already provides this gateway; the independent steps are for operators who supply their own. A production URL without an authenticated identity can show the sample UI but cannot import, edit or publish.

## Schema updates

Edit `db/schema.ts`, run `npm run db:generate`, inspect the generated migration, and commit both SQL and metadata. Applied migrations are append-only. For local previews, apply new SQL using the generated `dist/server/wrangler.json` and `.wrangler/state`. Never ship user data in migrations.

## Uncertain deliveries

A delivery is claimed before the provider write. Provider timeouts, errors, or a Worker interruption can leave a delivery uncertain or pending. The app never retries those claims automatically, including when Publish is clicked again.

1. Open the meeting’s Activity tab and inspect the failure.
2. Check the destination for the stable marker `trace:{meetingId}:{itemId}:{destination}`. For Slack, inspect the intended webhook channel. If the issue exists, verify its owner and update it in place if needed.
3. Keep the claim while investigating. Do not delete a claim merely because a request timed out.
4. If no external item exists, create it manually from the approved draft. This reference does not offer an automatic retry-unlock that could introduce duplicates.
5. A database operator can mark the confirmed delivery `sent` and record its real URL after checking ownership and destination. Always use bound parameters and scope the update to the authenticated owner and delivery ID. Never clear the unique delivery key.

An update after initial publication does not create or update an external item. This reference uses at-most-once automatic dispatch and an explicit manual reconciliation path; it cannot promise exactly-once execution across a network boundary.

## Data and deletion

Meetings and transcripts live in D1, with no media files. Local data is in `.wrangler/state`. The reference has no end-user deletion UI. Operators can delete an owner’s stored records under their data-retention process, but must consider the delivery ledger: deleting ledger history and re-importing the same transcript can permit duplicate external tasks. Retain a minimal delivery tombstone when implementing production retention.

The application does not implement shared-team invitations, granular roles, encryption beyond the host’s facilities, or provider OAuth refresh. Those are concrete next steps for a multi-tenant product, rather than hidden guarantees of this reference.
