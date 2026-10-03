import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import {
  canAssignRoles,
  canEditSiteSettings,
  canManageVenues,
  normalizeRole,
  type UserRole,
} from "@/lib/roles";

export type { UserRole };

export type Profile = {
  userId: string;
  email: string;
  accountName: string;
  role: UserRole;
  venueName: string;
  contactName: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  accessCode: string;
  active: boolean;
  createdAt: string;
};

export type SiteSettings = {
  facebook: string;
  instagram: string;
  youtube: string;
  contactEmail: string;
  contactPhone: string;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  account_name: string | null;
  role: string;
  venue_name: string;
  contact_name: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  notes: string;
  access_code: string;
  active: boolean;
  created_at: string | Date;
};

function asText(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    email: row.email ?? "",
    accountName: row.account_name ?? "",
    role: normalizeRole(row.role),
    venueName: row.venue_name,
    contactName: row.contact_name,
    phone: row.phone,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    notes: row.notes,
    accessCode: row.access_code,
    active: Boolean(row.active),
    createdAt: asText(row.created_at),
  };
}

const PROFILE_SELECT = `
  select p.user_id, u.email, u.name as account_name, p.role, p.venue_name, p.contact_name,
         p.phone, p.address, p.postal_code, p.city, p.notes, p.access_code, p.active, p.created_at::text as created_at
  from profiles p
  join "user" u on u.id = p.user_id
`;

export async function readProfile(userId: string): Promise<Profile | null> {
  const sql = await getSql();
  const rows = await sql.query<ProfileRow>(`${PROFILE_SELECT} where p.user_id = $1`, [userId]);
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function ensureProfile(userId: string): Promise<Profile> {
  const existing = await readProfile(userId);
  if (existing) return existing;
  const sql = await getSql();
  const users = await sql.query<{ email: string; name: string }>(
    `select email, name from "user" where id = $1`,
    [userId],
  );
  const user = users[0];
  if (!user) throw new Error("Brugeren blev ikke fundet.");
  const bosses = await sql<{ n: number }>`
    select count(*) as n from profiles where role in ('admin', 'administrator_manager')
  `;
  // A brand-new site still needs one manager. Every later signup is a guest.
  const role = Number(bosses[0]?.n ?? 0) === 0 ? "administrator_manager" : "gaest";
  await sql`
    insert into profiles (user_id, role, venue_name, contact_name)
    values (${userId}, ${role}, ${user.name || "Min klub"}, ${user.name || ""})
  `;
  const created = await readProfile(userId);
  if (!created) throw new Error("Profilen kunne ikke oprettes.");
  return created;
}

export async function saveOwnDetails(
  userId: string,
  input: {
    venueName: string;
    contactName: string;
    phone: string;
    address: string;
    postalCode: string;
    city: string;
  },
): Promise<Profile> {
  await ensureProfile(userId);
  const sql = await getSql();
  await sql`
    update profiles set
      venue_name = ${input.venueName},
      contact_name = ${input.contactName},
      phone = ${input.phone},
      address = ${input.address},
      postal_code = ${input.postalCode},
      city = ${input.city}
    where user_id = ${userId}
  `;
  if (input.venueName) {
    await sql`update "user" set name = ${input.venueName}, "updatedAt" = now() where id = ${userId}`;
  }
  const profile = await readProfile(userId);
  if (!profile) throw new Error("Profilen kunne ikke gemmes.");
  return profile;
}

async function requireRole(
  userId: string,
  allowed: (role: UserRole) => boolean,
  message: string,
): Promise<Profile> {
  const profile = await ensureProfile(userId);
  if (!allowed(profile.role)) throw new Error(message);
  return profile;
}

async function requireAdmin(userId: string): Promise<Profile> {
  return requireRole(userId, canAssignRoles, "Kun en administrator kan gøre det.");
}

async function requireStaff(userId: string): Promise<Profile> {
  return requireRole(userId, canManageVenues, "Kun en administrator kan gøre det.");
}

export function makeAccessCode(venueName: string): string {
  const letters = venueName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  const prefix = (letters.slice(0, 4) || "BAND").padEnd(4, "X");
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${n}`;
}

export function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9-]{8,40}$/.test(code);
}

export async function createVenueAccount(
  adminId: string,
  input: {
    venueName: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    postalCode: string;
    city: string;
    notes: string;
    accessCode: string;
  },
): Promise<{ profile: Profile; accessCode: string }> {
  await requireStaff(adminId);
  const code = input.accessCode || makeAccessCode(input.venueName);
  if (!isValidCode(code)) throw new Error("Adgangskoden skal være 8–40 tegn: bogstaver, tal og bindestreg.");
  const sql = await getSql();
  const existing = await sql.query<{ id: string }>(`select id from "user" where lower(email) = lower($1)`, [input.email]);
  if (existing[0]) throw new Error("Der findes allerede en bruger med den e-mail.");
  const userId = randomBytes(24).toString("base64url");
  const hash = await hashPassword(code);
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${input.venueName}, ${input.email}, true, now(), now())
  `;
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${randomBytes(24).toString("base64url")}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())
  `;
  await sql`
    insert into profiles (
      user_id, role, venue_name, contact_name, phone, address, postal_code, city, notes, access_code, created_by
    ) values (
      ${userId}, 'bruger', ${input.venueName}, ${input.contactName}, ${input.phone},
      ${input.address}, ${input.postalCode}, ${input.city}, ${input.notes}, ${code}, ${adminId}
    )
  `;
  const profile = await readProfile(userId);
  if (!profile) throw new Error("Profilen kunne ikke gemmes.");
  return { profile, accessCode: code };
}

export async function setUserRole(
  adminId: string,
  userId: string,
  role: UserRole,
): Promise<Profile> {
  const admin = await requireAdmin(adminId);
  if (!normalizeRole(role) || role !== normalizeRole(role)) throw new Error("Ukendt rolle.");
  const target = await readProfile(userId);
  if (!target) throw new Error("Brugeren blev ikke fundet.");
  if (userId === admin.userId && role !== admin.role) {
    throw new Error("Du kan ikke ændre din egen rolle her.");
  }
  if (admin.role !== "administrator_manager" && (role === "administrator_manager" || target.role === "administrator_manager")) {
    throw new Error("Kun en administrator-manager kan ændre den rolle.");
  }
  const protectedRole = role !== "admin" && role !== "administrator_manager";
  if (protectedRole && (target.role === "admin" || target.role === "administrator_manager")) {
    const sql = await getSql();
    const admins = await sql<{ n: number }>`
      select count(*) as n from profiles where role in ('admin', 'administrator_manager')
    `;
    if (Number(admins[0]?.n ?? 0) <= 1) throw new Error("Der skal være mindst én administrator.");
  }
  const sql = await getSql();
  await sql`update profiles set role = ${role} where user_id = ${userId}`;
  const profile = await readProfile(userId);
  if (!profile) throw new Error("Brugeren blev ikke fundet.");
  return profile;
}

export async function deleteOwnAccount(userId: string, password: string): Promise<{ ok: true }> {
  const profile = await ensureProfile(userId);
  const sql = await getSql();
  if (profile.role === "admin" || profile.role === "administrator_manager") {
    const admins = await sql<{ n: number }>`
      select count(*) as n from profiles where role in ('admin', 'administrator_manager')
    `;
    if (Number(admins[0]?.n ?? 0) <= 1) {
      throw new Error("Du er den eneste administrator. Giv rollen til en anden, før du sletter dig selv.");
    }
  }
  const accounts = await sql.query<{ password: string | null }>(
    `select password from account where "userId" = $1 and "providerId" = 'credential'`,
    [userId],
  );
  const hash = accounts[0]?.password;
  if (!hash) throw new Error("Kontoen har ingen adgangskode.");
  const ok = await verifyPassword({ hash, password });
  if (!ok) throw new Error("Adgangskoden passer ikke.");
  await sql`delete from "user" where id = ${userId}`;
  return { ok: true };
}

export async function listVenues(adminId: string): Promise<Profile[]> {
  await requireStaff(adminId);
  const sql = await getSql();
  const rows = await sql.query<ProfileRow>(`${PROFILE_SELECT} order by p.created_at desc`);
  return rows.map(mapProfile);
}

export async function updateVenue(
  adminId: string,
  input: {
    userId: string;
    venueName: string;
    contactName: string;
    phone: string;
    address: string;
    postalCode: string;
    city: string;
    notes: string;
  },
): Promise<Profile> {
  const actor = await requireStaff(adminId);
  const current = await readProfile(input.userId);
  if (!current) throw new Error("Brugeren blev ikke fundet.");
  if ((current.role === "admin" || current.role === "administrator_manager") && !canAssignRoles(actor.role)) {
    throw new Error("Kun administratoren kan rette en administrator.");
  }
  const sql = await getSql();
  await sql`
    update profiles set
      venue_name = ${input.venueName},
      contact_name = ${input.contactName},
      phone = ${input.phone},
      address = ${input.address},
      postal_code = ${input.postalCode},
      city = ${input.city},
      notes = ${input.notes}
    where user_id = ${input.userId}
  `;
  if (input.venueName) {
    await sql`update "user" set name = ${input.venueName}, "updatedAt" = now() where id = ${input.userId}`;
  }
  const profile = await readProfile(input.userId);
  if (!profile) throw new Error("Brugeren blev ikke fundet.");
  return profile;
}

export async function setVenueActive(adminId: string, userId: string, active: boolean): Promise<Profile> {
  const actor = await requireStaff(adminId);
  if (userId === actor.userId && !active) throw new Error("Du kan ikke lukke din egen adgang.");
  const current = await readProfile(userId);
  if (!current) throw new Error("Brugeren blev ikke fundet.");
  if ((current.role === "admin" || current.role === "administrator_manager") && !canAssignRoles(actor.role)) {
    throw new Error("Kun administratoren kan lukke en administrator.");
  }
  const sql = await getSql();
  await sql`update profiles set active = ${active} where user_id = ${userId}`;
  const profile = await readProfile(userId);
  if (!profile) throw new Error("Brugeren blev ikke fundet.");
  return profile;
}

export async function regenerateAccessCode(adminId: string, userId: string, custom?: string): Promise<Profile> {
  const actor = await requireStaff(adminId);
  const current = await readProfile(userId);
  if (!current) throw new Error("Brugeren blev ikke fundet.");
  if ((current.role === "admin" || current.role === "administrator_manager") && !canAssignRoles(actor.role)) {
    throw new Error("Kun administratoren kan skifte en administrators kode.");
  }
  const code = (custom || "").trim() || makeAccessCode(current.venueName || current.accountName);
  if (!isValidCode(code)) throw new Error("Adgangskoden skal være 8–40 tegn: bogstaver, tal og bindestreg.");
  const hash = await hashPassword(code);
  const sql = await getSql();
  const accounts = await sql.query<{ id: string }>(
    `select id from account where "userId" = $1 and "providerId" = 'credential'`,
    [userId],
  );
  if (!accounts[0]) throw new Error("Brugeren har ikke en adgangskode. Opret en ny bruger med e-mail.");
  await sql`update account set password = ${hash}, "updatedAt" = now() where id = ${accounts[0].id}`;
  await sql`update profiles set access_code = ${code} where user_id = ${userId}`;
  const profile = await readProfile(userId);
  if (!profile) throw new Error("Koden kunne ikke gemmes.");
  return profile;
}

export async function removeVenue(adminId: string, userId: string): Promise<{ ok: true }> {
  const admin = await requireAdmin(adminId);
  if (userId === admin.userId) throw new Error("Du kan ikke slette din egen konto her.");
  const sql = await getSql();
  await sql`delete from "user" where id = ${userId}`;
  return { ok: true };
}

export async function readSettings(): Promise<SiteSettings> {
  const sql = await getSql();
  const rows = await sql<{
    facebook: string;
    instagram: string;
    youtube: string;
    contact_email: string;
    contact_phone: string;
  }>`select facebook, instagram, youtube, contact_email, contact_phone from site_settings where id = 1`;
  const row = rows[0];
  return {
    facebook: row?.facebook ?? "",
    instagram: row?.instagram ?? "",
    youtube: row?.youtube ?? "",
    contactEmail: row?.contact_email ?? "",
    contactPhone: row?.contact_phone ?? "",
  };
}

export async function writeSettings(adminId: string, input: SiteSettings): Promise<SiteSettings> {
  await requireRole(adminId, canEditSiteSettings, "Kun den, der administrerer indstillinger, kan gøre det.");
  const sql = await getSql();
  await sql`
    insert into site_settings (id, facebook, instagram, youtube, contact_email, contact_phone)
    values (1, ${input.facebook}, ${input.instagram}, ${input.youtube}, ${input.contactEmail}, ${input.contactPhone})
    on conflict (id) do update set
      facebook = excluded.facebook,
      instagram = excluded.instagram,
      youtube = excluded.youtube,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone
  `;
  return readSettings();
}

export async function readBoardState(userId: string): Promise<{ state: string | null; updatedAt: string | null }> {
  const profile = await ensureProfile(userId);
  if (!profile.active) return { state: null, updatedAt: null };
  const sql = await getSql();
  const rows = await sql.query<{ state: string; updated_at: string }>(
    `select state, updated_at::text as updated_at from board_state where user_id = $1`,
    [userId],
  );
  if (!rows[0]) return { state: null, updatedAt: null };
  return { state: rows[0].state, updatedAt: rows[0].updated_at };
}

export async function writeBoardState(userId: string, state: string): Promise<{ updatedAt: string }> {
  const profile = await ensureProfile(userId);
  if (!profile.active) throw new Error("Adgangen er lukket.");
  if (state.length > 2_000_000) throw new Error("Scoreboardet er for stort til at gemme.");
  const sql = await getSql();
  const rows = await sql<{ updated_at: string }>`
    insert into board_state (user_id, state, updated_at)
    values (${userId}, ${state}, now())
    on conflict (user_id) do update set state = excluded.state, updated_at = now()
    returning updated_at::text as updated_at
  `;
  return { updatedAt: rows[0]?.updated_at ?? new Date().toISOString() };
}
