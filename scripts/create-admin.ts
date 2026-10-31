import "dotenv/config";
import { auth } from "../src/lib/auth";

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      "Uso: npx tsx scripts/create-admin.ts <email> <senha> [nome]",
    );
    process.exit(1);
  }

  // No headers: trusted server-side call, so no admin session is needed to
  // create the first admin. The role is set in the same write.
  const { user } = await auth.api.createUser({
    body: { email, password, name: name ?? email, role: "admin" },
  });

  console.log("Admin criado:", user.email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
