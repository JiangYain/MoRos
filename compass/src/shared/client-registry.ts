export type ClientGender = "female" | "male";

const STORED_HEARING_AID_BRANDS = [
  "phonak",
  "unitron",
  "oticon",
  "signia",
  "resound",
  "widex",
  "starkey",
  "other",
] as const;

export type ClientHearingAidBrand = (typeof STORED_HEARING_AID_BRANDS)[number];

/** Brands currently offered by the compact profile editor. Legacy IDs remain persistable. */
export const HEARING_AID_BRANDS = [
  { value: "phonak", label: "Phonak" },
  { value: "widex", label: "Widex" },
  { value: "signia", label: "Signia" },
  { value: "resound", label: "ReSound" },
  { value: "starkey", label: "Starkey" },
] as const satisfies readonly { value: ClientHearingAidBrand; label: string }[];

export type SelectableClientHearingAidBrand = (typeof HEARING_AID_BRANDS)[number]["value"];

export interface ClientProfileDraft {
  name: string;
  gender: ClientGender | null;
  age: number | null;
  contact: string;
  notes: string;
  hearingAidBrands: ClientHearingAidBrand[];
}

export interface ClientProfile extends ClientProfileDraft {
  displayName: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClientRegistry {
  clients: string[];
  assignments: Record<string, string>;
  profiles: Record<string, ClientProfile>;
}

/** Legacy renderer key. It is read once for migration and then removed. */
export const CLIENT_REGISTRY_STORAGE_KEY = "compass.clients.v1";

const CLIENT_GENDERS = new Set<ClientGender>(["female", "male"]);
const HEARING_AID_BRAND_IDS = new Set<ClientHearingAidBrand>(STORED_HEARING_AID_BRANDS);

export function emptyClientRegistry(): ClientRegistry {
  return { clients: [], assignments: {}, profiles: {} };
}

export function normalizeClientName(value: string): string {
  return value
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeField(value: unknown, maxLength = 160): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function normalizeAge(value: unknown): number | null {
  const age = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(age) && age >= 0 && age <= 130 ? age : null;
}

function ageFromLegacyBirthDate(value: unknown): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeField(value, 10));
  if (!match) return null;
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return normalizeAge(age);
}

export function normalizeClientBrands(value: unknown): ClientHearingAidBrand[] {
  const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(candidates.filter(
    (brand): brand is ClientHearingAidBrand =>
      typeof brand === "string" && HEARING_AID_BRAND_IDS.has(brand as ClientHearingAidBrand),
  ))];
}

export function clientRegistryKey(value: string): string {
  return normalizeClientName(value).toLocaleLowerCase("zh-CN");
}

export function normalizeClientProfileDraft(value: unknown): ClientProfileDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const name = normalizeClientName(typeof record.name === "string" ? record.name : "");
  if (!name) return undefined;
  const gender = typeof record.gender === "string" && CLIENT_GENDERS.has(record.gender as ClientGender)
    ? record.gender as ClientGender
    : null;
  return {
    name,
    gender,
    age: normalizeAge(record.age),
    contact: normalizeField(record.contact, 160),
    notes: normalizeField(record.notes, 320),
    hearingAidBrands: normalizeClientBrands(record.hearingAidBrands),
  };
}

export function clientProfileDisplayName(profile: Pick<ClientProfileDraft, "name">): string {
  return normalizeClientName(profile.name);
}

function uniqueClientNames(values: string[]): string[] {
  const names = new Map<string, string>();
  for (const value of values) {
    const name = normalizeClientName(value);
    const key = clientRegistryKey(name);
    if (name && !names.has(key)) names.set(key, name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function parseProfile(value: unknown, fallbackName: string): ClientProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const legacyName = [normalizeField(record.lastName, 40), normalizeField(record.firstName, 40)]
    .filter(Boolean)
    .join(" ");
  const displayName = normalizeClientName(
    normalizeField(record.name, 80) || normalizeField(record.displayName, 80) || legacyName || fallbackName,
  );
  if (!displayName) return undefined;
  const gender = typeof record.gender === "string" && CLIENT_GENDERS.has(record.gender as ClientGender)
    ? record.gender as ClientGender
    : null;
  const legacyContact = [record.homePhone, record.businessPhone, record.email]
    .map((entry) => normalizeField(entry, 120))
    .filter(Boolean)
    .join(" · ");
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : createdAt;

  return {
    displayName,
    name: displayName,
    gender,
    age: normalizeAge(record.age) ?? ageFromLegacyBirthDate(record.dateOfBirth),
    contact: normalizeField(record.contact, 160) || legacyContact,
    notes: normalizeField(record.notes, 320),
    hearingAidBrands: normalizeClientBrands(record.hearingAidBrands ?? record.hearingAidBrand),
    createdAt,
    updatedAt,
  };
}

export function parseClientRegistry(value: string | null): ClientRegistry {
  if (!value) return emptyClientRegistry();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyClientRegistry();
    const record = parsed as Record<string, unknown>;
    const clients = Array.isArray(record.clients)
      ? record.clients.filter((name): name is string => typeof name === "string")
      : [];
    const assignments: Record<string, string> = {};
    if (record.assignments && typeof record.assignments === "object") {
      for (const [sessionId, valueName] of Object.entries(record.assignments)) {
        const name = typeof valueName === "string" ? normalizeClientName(valueName) : "";
        if (sessionId && name) assignments[sessionId] = name;
      }
    }
    const profiles: Record<string, ClientProfile> = {};
    if (record.profiles && typeof record.profiles === "object") {
      for (const [storedName, valueProfile] of Object.entries(record.profiles)) {
        const profile = parseProfile(valueProfile, storedName);
        if (profile) profiles[clientRegistryKey(profile.displayName)] = profile;
      }
    }
    return {
      clients: uniqueClientNames([
        ...clients,
        ...Object.values(assignments),
        ...Object.values(profiles).map((profile) => profile.displayName),
      ]),
      assignments,
      profiles,
    };
  } catch {
    return emptyClientRegistry();
  }
}

export function addClient(registry: ClientRegistry, value: string): ClientRegistry {
  const name = normalizeClientName(value);
  if (!name) return registry;
  return { ...registry, clients: uniqueClientNames([...registry.clients, name]) };
}

export function addClientProfile(
  registry: ClientRegistry,
  draft: ClientProfileDraft,
  now = Date.now(),
): ClientRegistry {
  const normalized = normalizeClientProfileDraft(draft);
  if (!normalized) return registry;
  const key = clientRegistryKey(normalized.name);
  const existing = registry.profiles[key];
  const profile: ClientProfile = {
    ...normalized,
    displayName: normalized.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return {
    ...registry,
    clients: uniqueClientNames([...registry.clients, profile.displayName]),
    profiles: { ...registry.profiles, [key]: profile },
  };
}

export function assignSessionToClient(
  registry: ClientRegistry,
  sessionId: string,
  value: string,
): ClientRegistry {
  const name = normalizeClientName(value);
  if (!sessionId || !name) return registry;
  return {
    ...registry,
    clients: uniqueClientNames([...registry.clients, name]),
    assignments: { ...registry.assignments, [sessionId]: name },
  };
}

export function unassignSession(registry: ClientRegistry, sessionId: string): ClientRegistry {
  if (!(sessionId in registry.assignments)) return registry;
  const assignments = { ...registry.assignments };
  delete assignments[sessionId];
  return { ...registry, assignments };
}
