import { execSync } from "node:child_process";
import "dotenv/config";
import { assertSafeTestDatabaseUrl, getTestDatabaseUrl } from "./helpers/db";

export function setup(): void {
  const databaseUrl = getTestDatabaseUrl();

  // Must run before any migration command so a development database is never touched.
  assertSafeTestDatabaseUrl(databaseUrl);

  // Application modules and prisma.config.ts read DATABASE_URL; both must see the test database.
  process.env.DATABASE_URL = databaseUrl;

  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
