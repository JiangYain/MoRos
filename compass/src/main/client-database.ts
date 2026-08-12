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
import {
  emptyAudiogramCurve,
  normalizeAudiogramCurve,
  normalizeClientAudiogramDraft,
  isAudiogramTransducer,
  type AudiogramCurve,
  type AudiogramTransducer,
  type ClientAudiogramDraft,
  type ClientAudiogramRecord,
} from "../shared/client-audiograms.ts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const CLIENT_DATABASE_SCHEMA_VERSION = 3;
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

const AUDIOGRAM_RECORDS_DDL = `
  CREATE TABLE IF NOT EXISTS audiogram_records (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    record_date TEXT NOT NULL,
    use_audiogram_right INTEGER NOT NULL DEFAULT 1 CHECK (use_audiogram_right IN (0, 1)),
    use_audiogram_left INTEGER NOT NULL DEFAULT 1 CHECK (use_audiogram_left IN (0, 1)),
    transducer_right TEXT NOT NULL DEFAULT 'Insert earphone',
    transducer_left TEXT NOT NULL DEFAULT 'Insert earphone',
    right_ac TEXT NOT NULL,
    right_bc TEXT NOT NULL,
    right_ucl TEXT NOT NULL,
    left_ac TEXT NOT NULL,
    left_bc TEXT NOT NULL,
    left_ucl TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audiogram_records_client
    ON audiogram_records(client_id, record_date);
`;

const AUDIOGRAM_ROW_COLUMNS = `
  id, record_date, use_audiogram_right, use_audiogram_left,
  transducer_right, transducer_left,
  right_ac, right_bc, right_ucl, left_ac, left_bc, left_ucl,
  created_at, updated_at
`;

function audiogramCurveColumn(value: unknown): AudiogramCurve {
  try {
    const parsed = normalizeAudiogramCurve(JSON.parse(String(value)));
    if (parsed) return parsed;
  } catch {
    // Corrupt column content degrades to an empty curve instead of crashing reads.
  }
  return emptyAudiogramCurve();
}

function audiogramTransducerColumn(value: unknown): AudiogramTransducer {
  return isAudiogramTransducer(value) ? value : "Insert earphone";
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

          ${AUDIOGRAM_RECORDS_DDL}

          PRAGMA user_version = ${CLIENT_DATABASE_SCHEMA_VERSION};
        `);
      });
      return;
    }

    if (version === 1) this.migrateV1ToV2();
    this.migrateV2ToV3();
  }

  // version 1 → 2: relax clients.gender to allow NULL and only female/male.
  // Retired values ("unspecified", "non-binary") are converted to NULL.
  // SQLite cannot alter a column constraint in place, so the clients table
  // is rebuilt while foreign keys are briefly disabled.
  private migrateV1ToV2(): void {
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
        this.database.exec("PRAGMA user_version = 2;");
      });
    } finally {
      this.database.exec("PRAGMA foreign_keys = ON");
    }
  }

  // version 2 → 3: add per-client audiogram records for the hearing health
  // workspace. Threshold curves are stored as validated JSON text columns.
  private migrateV2ToV3(): void {
    this.transaction(() => {
      this.database.exec(AUDIOGRAM_RECORDS_DDL);
      const violations = this.database.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error("Client database v2→v3 migration produced orphaned foreign keys.");
      }
      this.database.exec("PRAGMA user_version = 3;");
    });
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

  /**
   * Update (and possibly rename) an existing client profile. Brands, session
   * assignments, and audiogram records reference clients.id, so a key change
   * on the same row migrates them implicitly inside the transaction.
   */
  updateProfile(originalNameValue: string, value: ClientProfileDraft): ClientRegistry {
    const originalName = normalizeClientName(originalNameValue);
    if (!originalName) throw new Error("客户姓名不能为空。");
    const profile = normalizeClientProfileDraft(value);
    if (!profile) throw new Error("客户档案无效或缺少姓名。");
    const now = Date.now();
    this.transaction(() => {
      const clientId = this.ensureClient(originalName, now);
      const newKey = clientRegistryKey(profile.name);
      const conflict = this.database.prepare(
        "SELECT id FROM clients WHERE client_key = ? AND id != ?",
      ).get(newKey, clientId);
      if (conflict) throw new Error(`已存在同名客户“${profile.name}”。`);
      this.database.prepare(`
        UPDATE clients
        SET client_key = ?, display_name = ?, gender = ?, age = ?, contact = ?, notes = ?,
            has_profile = 1, updated_at = ?
        WHERE id = ?
      `).run(
        newKey,
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

  /**
   * Delete a client. Brand, session assignment, and audiogram rows cascade
   * via their client_id foreign keys; session files themselves stay untouched.
   */
  deleteProfile(nameValue: string): ClientRegistry {
    const name = normalizeClientName(nameValue);
    if (!name) throw new Error("客户姓名不能为空。");
    this.transaction(() => {
      this.database.prepare("DELETE FROM clients WHERE client_key = ?").run(clientRegistryKey(name));
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

  private audiogramFromRow(row: Record<string, unknown>, clientName: string): ClientAudiogramRecord {
    return {
      id: numberValue(row.id),
      clientName,
      date: String(row.record_date),
      useAudiogramRight: numberValue(row.use_audiogram_right) === 1,
      useAudiogramLeft: numberValue(row.use_audiogram_left) === 1,
      transducerRight: audiogramTransducerColumn(row.transducer_right),
      transducerLeft: audiogramTransducerColumn(row.transducer_left),
      right: {
        ac: audiogramCurveColumn(row.right_ac),
        bc: audiogramCurveColumn(row.right_bc),
        ucl: audiogramCurveColumn(row.right_ucl),
      },
      left: {
        ac: audiogramCurveColumn(row.left_ac),
        bc: audiogramCurveColumn(row.left_bc),
        ucl: audiogramCurveColumn(row.left_ucl),
      },
      createdAt: numberValue(row.created_at),
      updatedAt: numberValue(row.updated_at),
    };
  }

  /** Newest first: by measurement date, then creation time, then id. */
  listAudiograms(clientNameValue: string): ClientAudiogramRecord[] {
    if (this.closed) return [];
    const name = normalizeClientName(clientNameValue);
    if (!name) return [];
    const client = this.database.prepare(
      "SELECT id, display_name FROM clients WHERE client_key = ?",
    ).get(clientRegistryKey(name));
    if (!client) return [];
    const rows = this.database.prepare(`
      SELECT ${AUDIOGRAM_ROW_COLUMNS}
      FROM audiogram_records
      WHERE client_id = ?
      ORDER BY record_date DESC, created_at DESC, id DESC
    `).all(numberValue(client.id));
    return rows.map((row) => this.audiogramFromRow(row, String(client.display_name)));
  }

  /** Upsert: a null draft id inserts a new record, otherwise the record is updated in place. */
  saveAudiogram(clientNameValue: string, value: ClientAudiogramDraft): ClientAudiogramRecord {
    const draft = normalizeClientAudiogramDraft(value);
    if (!draft) throw new Error("听力图记录无效。");
    const now = Date.now();
    let savedId = 0;
    let displayName = "";
    this.transaction(() => {
      const clientId = this.ensureClient(clientNameValue, now);
      const client = this.database.prepare("SELECT display_name FROM clients WHERE id = ?").get(clientId);
      displayName = String(client?.display_name ?? normalizeClientName(clientNameValue));
      const values = [
        draft.date,
        draft.useAudiogramRight ? 1 : 0,
        draft.useAudiogramLeft ? 1 : 0,
        draft.transducerRight,
        draft.transducerLeft,
        JSON.stringify(draft.right.ac),
        JSON.stringify(draft.right.bc),
        JSON.stringify(draft.right.ucl),
        JSON.stringify(draft.left.ac),
        JSON.stringify(draft.left.bc),
        JSON.stringify(draft.left.ucl),
      ];
      if (draft.id === null) {
        const inserted = this.database.prepare(`
          INSERT INTO audiogram_records (
            client_id, record_date, use_audiogram_right, use_audiogram_left,
            transducer_right, transducer_left,
            right_ac, right_bc, right_ucl, left_ac, left_bc, left_ucl,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(clientId, ...values, now, now);
        savedId = numberValue(inserted.lastInsertRowid);
      } else {
        const updated = this.database.prepare(`
          UPDATE audiogram_records
          SET record_date = ?, use_audiogram_right = ?, use_audiogram_left = ?,
              transducer_right = ?, transducer_left = ?,
              right_ac = ?, right_bc = ?, right_ucl = ?, left_ac = ?, left_bc = ?, left_ucl = ?,
              updated_at = ?
          WHERE id = ? AND client_id = ?
        `).run(...values, now, draft.id, clientId);
        if (numberValue(updated.changes) === 0) throw new Error("找不到要更新的听力图记录。");
        savedId = draft.id;
      }
    });
    const row = this.database.prepare(`
      SELECT ${AUDIOGRAM_ROW_COLUMNS}
      FROM audiogram_records
      WHERE id = ?
    `).get(savedId);
    if (!row) throw new Error("听力图记录保存失败。");
    return this.audiogramFromRow(row, displayName);
  }

  /** Deletes one record owned by the client; false when either does not exist. */
  deleteAudiogram(clientNameValue: string, id: number): boolean {
    const name = normalizeClientName(clientNameValue);
    if (!name) return false;
    if (!Number.isInteger(id) || id <= 0) return false;
    return this.transaction(() => {
      const client = this.database.prepare(
        "SELECT id FROM clients WHERE client_key = ?",
      ).get(clientRegistryKey(name));
      if (!client) return false;
      const deleted = this.database.prepare(
        "DELETE FROM audiogram_records WHERE id = ? AND client_id = ?",
      ).run(id, numberValue(client.id));
      return numberValue(deleted.changes) > 0;
    });
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
