import {
  clientRegistryKey,
  emptyClientRegistry,
  normalizeClientName,
  normalizeClientProfileDraft,
  parseClientRegistry,
  type ClientProfile,
  type ClientProfileDraft,
  type ClientRegistry,
} from "../shared/client-registry.ts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const CLIENT_DATABASE_SCHEMA_VERSION = 2;
const MAX_LEGACY_REGISTRY_BYTES = 8_000_000;

interface ClientRow {
  id: number;
  client_key: string;
  display_name: string;
  gender: ClientProfile["gender"];
  age: number | null;
  contact: string;
  notes: string;
  has_profile: number;
  created_at: number;
  updated_at: number;
}

interface BrandRow {
  client_id: number;
  brand: string;
}

interface AssignmentRow {
  session_id: string;
  display_name: string;
}

function numberValue(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function clientRow(value: Record<string, unknown>): ClientRow {
  return {
    id: numberValue(value.id),
    client_key: String(value.client_key),
    display_name: String(value.display_name),
    gender: (value.gender === null ? null : String(value.gender)) as ClientProfile["gender"],
    age: value.age === null ? null : numberValue(value.age),
    contact: String(value.contact),
    notes: String(value.notes),
    has_profile: numberValue(value.has_profile),
    created_at: numberValue(value.created_at),
    updated_at: numberValue(value.updated_at),
  };
}

function normalizeSessionId(value: string): string {
  return value.trim().slice(0, 200);
}

export class ClientDatabase {
  readonly databasePath: string;
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath, {
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    this.configure();
    this.migrate();
  }

  private configure(): void {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec("PRAGMA synchronous = NORMAL");
    if (this.databasePath !== ":memory:") this.database.exec("PRAGMA journal_mode = WAL");
  }

  private migrate(): void {
    const row = this.database.prepare("PRAGMA user_version").get();
    const version = numberValue(row?.user_version ?? 0);
    if (version > CLIENT_DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `Client database schema ${version} is newer than supported version ${CLIENT_DATABASE_SCHEMA_VERSION}.`,
      );
    }
    if (version === CLIENT_DATABASE_SCHEMA_VERSION) return;

    if (version === 0) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY,
            client_key TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            gender TEXT CHECK (gender IS NULL OR gender IN ('female', 'male')),
            age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
            contact TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            has_profile INTEGER NOT NULL DEFAULT 0 CHECK (has_profile IN (0, 1)),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS client_hearing_aid_brands (
            client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            brand TEXT NOT NULL,
            PRIMARY KEY (client_id, brand)
          );

          CREATE TABLE IF NOT EXISTS session_client_assignments (
            session_id TEXT PRIMARY KEY,
            client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            assigned_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_session_client_assignments_client
            ON session_client_assignments(client_id);

          CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );

          PRAGMA user_version = ${CLIENT_DATABASE_SCHEMA_VERSION};
        `);
      });
      return;
    }

    // version 1 → 2: relax clients.gender to allow NULL and only female/male.
    // Retired values ("unspecified", "non-binary") are converted to NULL.
    // SQLite cannot alter a column constraint in place, so the clients table
    // is rebuilt while foreign keys are briefly disabled.
    this.database.exec("PRAGMA foreign_keys = OFF");
    try {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE clients_new (
            id INTEGER PRIMARY KEY,
            client_key TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            gender TEXT CHECK (gender IS NULL OR gender IN ('female', 'male')),
            age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
            contact TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            has_profile INTEGER NOT NULL DEFAULT 0 CHECK (has_profile IN (0, 1)),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          INSERT INTO clients_new (
            id, client_key, display_name, gender, age, contact, notes,
            has_profile, created_at, updated_at
          )
          SELECT
            id, client_key, display_name,
            CASE WHEN gender IN ('female', 'male') THEN gender ELSE NULL END,
            age, contact, notes, has_profile, created_at, updated_at
          FROM clients;

          DROP TABLE clients;
          ALTER TABLE clients_new RENAME TO clients;
        `);
        const violations = this.database.prepare("PRAGMA foreign_key_check").all();
        if (violations.length > 0) {
          throw new Error("Client database v1→v2 migration produced orphaned foreign keys.");
        }
        this.database.exec(`PRAGMA user_version = ${CLIENT_DATABASE_SCHEMA_VERSION};`);
      });
    } finally {
      this.database.exec("PRAGMA foreign_keys = ON");
    }
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private ensureClient(name: string, now = Date.now()): number {
    const displayName = normalizeClientName(name);
    if (!displayName) throw new Error("客户姓名不能为空。");
    const key = clientRegistryKey(displayName);
    this.database.prepare(`
      INSERT OR IGNORE INTO clients (
        client_key, display_name, gender, age, contact, notes, has_profile, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, '', '', 0, ?, ?)
    `).run(key, displayName, now, now);
    const row = this.database.prepare("SELECT id FROM clients WHERE client_key = ?").get(key);
    if (!row) throw new Error("无法创建客户记录。");
    return numberValue(row.id);
  }

  private replaceBrands(clientId: number, brands: readonly string[]): void {
    this.database.prepare("DELETE FROM client_hearing_aid_brands WHERE client_id = ?").run(clientId);
    const insert = this.database.prepare(
      "INSERT OR IGNORE INTO client_hearing_aid_brands (client_id, brand) VALUES (?, ?)",
    );
    for (const brand of brands) insert.run(clientId, brand);
  }

  getSchemaVersion(): number {
    return numberValue(this.database.prepare("PRAGMA user_version").get()?.user_version ?? 0);
  }

  getRegistry(): ClientRegistry {
    if (this.closed) return emptyClientRegistry();
    const clients = this.database.prepare(`
      SELECT id, client_key, display_name, gender, age, contact, notes,
             has_profile, created_at, updated_at
      FROM clients
      ORDER BY display_name COLLATE NOCASE
    `).all().map((row) => clientRow(row));
    const brandsByClient = new Map<number, string[]>();
    for (const row of this.database.prepare(`
      SELECT client_id, brand
      FROM client_hearing_aid_brands
      ORDER BY client_id, brand
    `).all() as unknown as BrandRow[]) {
      const clientId = numberValue(row.client_id);
      const brands = brandsByClient.get(clientId) ?? [];
      brands.push(String(row.brand));
      brandsByClient.set(clientId, brands);
    }

    const profiles: Record<string, ClientProfile> = {};
    for (const row of clients) {
      if (!row.has_profile) continue;
      profiles[row.client_key] = {
        displayName: row.display_name,
        name: row.display_name,
        gender: row.gender,
        age: row.age,
        contact: row.contact,
        notes: row.notes,
        hearingAidBrands: brandsByClient.get(row.id) ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } as ClientProfile;
    }

    const assignments: Record<string, string> = {};
    for (const row of this.database.prepare(`
      SELECT assignment.session_id, client.display_name
      FROM session_client_assignments AS assignment
      JOIN clients AS client ON client.id = assignment.client_id
      ORDER BY assignment.session_id
    `).all() as unknown as AssignmentRow[]) {
      assignments[String(row.session_id)] = String(row.display_name);
    }

    return parseClientRegistry(JSON.stringify({
      clients: clients.map((row) => row.display_name),
      assignments,
      profiles,
    }));
  }

  saveProfile(value: ClientProfileDraft): ClientRegistry {
    const profile = normalizeClientProfileDraft(value);
    if (!profile) throw new Error("客户档案无效或缺少姓名。");
    const now = Date.now();
    this.transaction(() => {
      const clientId = this.ensureClient(profile.name, now);
      this.database.prepare(`
        UPDATE clients
        SET display_name = ?, gender = ?, age = ?, contact = ?, notes = ?,
            has_profile = 1, updated_at = ?
        WHERE id = ?
      `).run(
        profile.name,
        profile.gender,
        profile.age,
        profile.contact,
        profile.notes,
        now,
        clientId,
      );
      this.replaceBrands(clientId, profile.hearingAidBrands);
    });
    return this.getRegistry();
  }

  assignSession(sessionIdValue: string, clientName: string): ClientRegistry {
    const sessionId = normalizeSessionId(sessionIdValue);
    if (!sessionId) throw new Error("Session ID 不能为空。");
    this.transaction(() => {
      const clientId = this.ensureClient(clientName);
      this.database.prepare(`
        INSERT INTO session_client_assignments (session_id, client_id, assigned_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          client_id = excluded.client_id,
          assigned_at = excluded.assigned_at
      `).run(sessionId, clientId, Date.now());
    });
    return this.getRegistry();
  }

  unassignSession(sessionIdValue: string): ClientRegistry {
    const sessionId = normalizeSessionId(sessionIdValue);
    if (!sessionId) throw new Error("Session ID 不能为空。");
    this.database.prepare("DELETE FROM session_client_assignments WHERE session_id = ?").run(sessionId);
    return this.getRegistry();
  }

  importLegacyRegistry(serializedRegistry: string): ClientRegistry {
    if (Buffer.byteLength(serializedRegistry, "utf8") > MAX_LEGACY_REGISTRY_BYTES) {
      throw new Error("旧客户档案数据过大，无法自动迁移。");
    }
    const legacy = parseClientRegistry(serializedRegistry);
    const importedAt = Date.now();
    this.transaction(() => {
      for (const name of legacy.clients) this.ensureClient(name, importedAt);

      for (const profile of Object.values(legacy.profiles)) {
        const key = clientRegistryKey(profile.displayName);
        const existing = this.database.prepare(
          "SELECT id, has_profile, created_at FROM clients WHERE client_key = ?",
        ).get(key);
        const clientId = existing
          ? numberValue(existing.id)
          : this.ensureClient(profile.displayName, profile.createdAt);
        if (existing && numberValue(existing.has_profile)) continue;
        const createdAt = existing
          ? Math.min(numberValue(existing.created_at), profile.createdAt)
          : profile.createdAt;
        this.database.prepare(`
          UPDATE clients
          SET display_name = ?, gender = ?, age = ?, contact = ?, notes = ?,
              has_profile = 1, created_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          profile.displayName,
          profile.gender,
          profile.age,
          profile.contact,
          profile.notes,
          createdAt,
          profile.updatedAt,
          clientId,
        );
        this.replaceBrands(clientId, profile.hearingAidBrands);
      }

      for (const [sessionIdValue, name] of Object.entries(legacy.assignments)) {
        const sessionId = normalizeSessionId(sessionIdValue);
        if (!sessionId) continue;
        const clientId = this.ensureClient(name, importedAt);
        this.database.prepare(`
          INSERT OR IGNORE INTO session_client_assignments (session_id, client_id, assigned_at)
          VALUES (?, ?, ?)
        `).run(sessionId, clientId, importedAt);
      }

      this.database.prepare(`
        INSERT INTO app_metadata (key, value) VALUES ('legacy_local_storage_imported_at', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(importedAt));
    });
    return this.getRegistry();
  }

  close(): void {
    if (this.closed) return;
    if (this.databasePath !== ":memory:") {
      try {
        this.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
        // Closing still releases the connection if a checkpoint cannot complete.
      }
    }
    this.database.close();
    this.closed = true;
  }
}
