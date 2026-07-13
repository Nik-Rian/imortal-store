import "dotenv/config";
import { auth } from "../src/lib/auth";

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Uso: npx tsx scripts/create-admin.ts <email> <senha> [nome]");
    process.exit(1);
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name: name ?? email },
  });

  console.log("Admin criado:", result.user.email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});