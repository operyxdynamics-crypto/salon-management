import { Client } from "pg";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";
import { describeDatabaseUrl, open, seal } from "@/lib/secret-box";

/**
 * A customer's own database, on their server.
 *
 * The connection string arrives once, is sealed immediately, and is never returned to any browser
 * again - responses carry only the host name. The one thing the plain credential is ever used for
 * is the connection test, which runs here on the server and reports reachability and the latest
 * applied migration, so drift ("they are three releases behind") is visible from the client page
 * without anyone touching their infrastructure.
 */

const saveSchema = z.object({
  databaseUrl: z.string().trim().regex(/^postgres(ql)?:\/\//, "Must be a postgres:// connection string").optional(),
  appUrl: z.string().trim().url().optional().or(z.literal("")),
  hostedBy: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    await requirePlatformAdmin();
    const { tenantId } = await context.params;
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid environment details", 400, parsed.error.flatten());
    const { databaseUrl, appUrl, hostedBy, notes } = parsed.data;

    const existing = await db.tenantEnvironment.findUnique({ where: { tenantId } });
    if (!existing && !databaseUrl) {
      throw new PlatformError("VALIDATION", "A connection string is required the first time", 400);
    }

    const common = {
      appUrl: appUrl || null,
      hostedBy: hostedBy || null,
      notes: notes || null,
      // A new credential invalidates what we knew about the old one.
      ...(databaseUrl ? { databaseUrlEncrypted: seal(databaseUrl), lastCheckedAt: null, lastCheckOk: null, lastMigration: null } : {}),
    };

    const environment = existing
      ? await db.tenantEnvironment.update({ where: { tenantId }, data: common })
      : await db.tenantEnvironment.create({ data: { tenantId, ...common, databaseUrlEncrypted: seal(databaseUrl!) } });

    return Response.json({ data: publicView(environment) }, { status: existing ? 200 : 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

/** Connection test. The only moment the sealed credential is ever opened. */
export async function PATCH(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    await requirePlatformAdmin();
    const { tenantId } = await context.params;
    const environment = await db.tenantEnvironment.findUnique({ where: { tenantId } });
    if (!environment) throw new PlatformError("NOT_FOUND", "No environment recorded for this salon", 404);

    let ok = false;
    let migration: string | null = null;
    let message = "";

    const client = new Client({
      connectionString: open(environment.databaseUrlEncrypted),
      // A support click must not hang for two minutes because a firewall drops packets silently.
      connectionTimeoutMillis: 8_000,
      statement_timeout: 8_000,
    });
    try {
      await client.connect();
      const version = await client.query("select version()");
      // Their schema is managed by prisma migrate, so this table is the honest version indicator.
      const applied = await client.query(
        `select migration_name from _prisma_migrations where finished_at is not null order by finished_at desc limit 1`,
      ).catch(() => null);
      ok = true;
      migration = applied?.rows[0]?.migration_name ?? null;
      message = migration
        ? `Reachable. ${String(version.rows[0]?.version ?? "").split(" on ")[0]}.`
        : "Reachable, but no migrations found - the database looks empty. Run the deploy runbook.";
    } catch (error) {
      message = error instanceof Error ? error.message : "Could not connect";
    } finally {
      await client.end().catch(() => undefined);
    }

    const updated = await db.tenantEnvironment.update({
      where: { tenantId },
      data: { lastCheckedAt: new Date(), lastCheckOk: ok, lastMigration: migration },
    });

    return Response.json({ data: { ...publicView(updated), message } }, { status: ok ? 200 : 502 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

/** What leaves the server: the host, never the credential. */
function publicView(environment: {
  appUrl: string | null; hostedBy: string | null; notes: string | null;
  databaseUrlEncrypted: string; lastCheckedAt: Date | null; lastCheckOk: boolean | null; lastMigration: string | null;
}) {
  return {
    appUrl: environment.appUrl,
    hostedBy: environment.hostedBy,
    notes: environment.notes,
    databaseHost: describeDatabaseUrl(open(environment.databaseUrlEncrypted)),
    lastCheckedAt: environment.lastCheckedAt?.toISOString() ?? null,
    lastCheckOk: environment.lastCheckOk,
    lastMigration: environment.lastMigration,
  };
}
