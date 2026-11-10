import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const meetings = sqliteTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    fingerprint: text("fingerprint").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [uniqueIndex("meeting_content").on(t.owner, t.fingerprint)],
);
export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    meetingId: text("meeting_id").notNull(),
    itemId: text("item_id").notNull(),
    destination: text("destination").notNull(),
    status: text("status").notNull(),
    url: text("url").notNull().default(""),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("delivery_once").on(
      t.owner,
      t.meetingId,
      t.itemId,
      t.destination,
    ),
  ],
);
