import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // This config is read by the Prisma CLI only - migrate, studio, db push. The app's
    // runtime client builds its own pool from DATABASE_URL in src/lib/db.ts.
    //
    // So the CLI gets DIRECT_URL (5432). Migrations cannot run through Supabase's pgBouncer
    // pooler on 6543: they need session-level features like advisory locks and DDL in a
    // transaction, which a transaction pooler does not support. Pointing the CLI at 6543 is
    // why `migrate dev` hung with no output.
    url: env("DIRECT_URL"),
  },
});
