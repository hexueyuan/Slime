import type BetterSqlite3 from "better-sqlite3";
import type { Group, GroupItem, Capability } from "@shared/types/gateway";
import * as modelDao from "./modelDao";

export const BUILTIN_CAPABILITIES: Capability[] = ["reasoning", "vision", "image_gen", "tool_call"];

interface GroupRow {
  id: number;
  name: string;
  balance_mode: string;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

interface GroupItemRow {
  id: number;
  group_id: number;
  channel_id: number;
  model_name: string;
  priority: number;
  weight: number;
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    balanceMode: row.balance_mode as Group["balanceMode"],
    isBuiltin: !!row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToGroupItem(row: GroupItemRow): GroupItem {
  return {
    id: row.id,
    groupId: row.group_id,
    channelId: row.channel_id,
    modelName: row.model_name,
    priority: row.priority,
    weight: row.weight,
  };
}

export function listGroups(db: BetterSqlite3.Database): Group[] {
  const rows = db.prepare("SELECT * FROM groups_ ORDER BY id").all() as GroupRow[];
  return rows.map(rowToGroup);
}

export function getGroup(db: BetterSqlite3.Database, id: number): Group | undefined {
  const row = db.prepare("SELECT * FROM groups_ WHERE id = ?").get(id) as GroupRow | undefined;
  return row ? rowToGroup(row) : undefined;
}

export function getGroupByName(db: BetterSqlite3.Database, name: string): Group | undefined {
  const row = db.prepare("SELECT * FROM groups_ WHERE name = ?").get(name) as GroupRow | undefined;
  return row ? rowToGroup(row) : undefined;
}

export function createGroup(
  db: BetterSqlite3.Database,
  data: Omit<Group, "id" | "createdAt" | "updatedAt">,
): Group {
  const stmt = db.prepare(`
    INSERT INTO groups_ (name, balance_mode, is_builtin)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(data.name, data.balanceMode, data.isBuiltin ? 1 : 0);
  return getGroup(db, Number(result.lastInsertRowid))!;
}

export function updateGroup(
  db: BetterSqlite3.Database,
  id: number,
  data: Partial<Omit<Group, "id" | "createdAt" | "updatedAt">>,
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    sets.push("name = ?");
    values.push(data.name);
  }
  if (data.balanceMode !== undefined) {
    sets.push("balance_mode = ?");
    values.push(data.balanceMode);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE groups_ SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteGroup(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM groups_ WHERE id = ?").run(id);
}

export function listGroupItems(db: BetterSqlite3.Database, groupId: number): GroupItem[] {
  const rows = db
    .prepare("SELECT * FROM group_items WHERE group_id = ? ORDER BY priority DESC, id")
    .all(groupId) as GroupItemRow[];
  return rows.map(rowToGroupItem);
}

export function setGroupItems(
  db: BetterSqlite3.Database,
  groupId: number,
  items: Omit<GroupItem, "id" | "groupId">[],
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM group_items WHERE group_id = ?").run(groupId);
    const insert = db.prepare(`
      INSERT INTO group_items (group_id, channel_id, model_name, priority, weight)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insert.run(groupId, item.channelId, item.modelName, item.priority, item.weight);
    }
  });
  tx();
}

export function ensureBuiltinGroups(db: BetterSqlite3.Database): void {
  const allGroups = [...BUILTIN_CAPABILITIES, "chat" as string];
  for (const name of allGroups) {
    const existing = db
      .prepare("SELECT id FROM groups_ WHERE name = ? AND is_builtin = 1")
      .get(name) as { id: number } | undefined;
    if (!existing) {
      db.prepare(
        `INSERT OR IGNORE INTO groups_ (name, balance_mode, is_builtin) VALUES (?, 'failover', 1)`,
      ).run(name);
    }
  }
}

export function syncBuiltinGroupItems(db: BetterSqlite3.Database): void {
  const models = modelDao.listModels(db).filter((m) => m.enabled);

  const allGroups = [...BUILTIN_CAPABILITIES, "chat" as string];
  for (const groupName of allGroups) {
    const group = db
      .prepare("SELECT id FROM groups_ WHERE name = ? AND is_builtin = 1")
      .get(groupName) as { id: number } | undefined;
    if (!group) continue;

    const matched =
      groupName === "chat"
        ? models.filter((m) => m.type === "chat")
        : models.filter((m) => m.capabilities.includes(groupName as Capability));

    db.prepare("DELETE FROM group_items WHERE group_id = ?").run(group.id);
    const insert = db.prepare(
      `INSERT INTO group_items (group_id, channel_id, model_name, priority, weight) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const m of matched) {
      insert.run(group.id, m.channelId, m.modelName, m.priority, 1);
    }
  }
}

export function syncCompositeGroupItems(db: BetterSqlite3.Database, groupName: string): void {
  const caps = groupName.split("+") as Capability[];
  if (caps.length < 2) return;

  const group = db
    .prepare("SELECT id FROM groups_ WHERE name = ? AND is_builtin = 1")
    .get(groupName) as { id: number } | undefined;
  if (!group) return;

  const models = modelDao
    .listModels(db)
    .filter((m) => m.enabled && caps.every((c) => m.capabilities.includes(c)));

  db.prepare("DELETE FROM group_items WHERE group_id = ?").run(group.id);
  const insert = db.prepare(
    `INSERT INTO group_items (group_id, channel_id, model_name, priority, weight) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const m of models) {
    insert.run(group.id, m.channelId, m.modelName, m.priority, 1);
  }
}
