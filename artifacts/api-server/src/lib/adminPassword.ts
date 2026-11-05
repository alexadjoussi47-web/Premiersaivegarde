import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db, adminCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Hashes the configured password at boot; the cleartext is never stored. */
export async function initializeAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const salt = randomBytes(24).toString("hex");
  const passwordHash = (await derivePassword(password, salt)).toString("hex");
  const [existing] = await db.select({ id: adminCredentialsTable.id })
    .from(adminCredentialsTable)
    .limit(1);

  if (existing) {
    await db
      .update(adminCredentialsTable)
      .set({ passwordHash, salt, updatedAt: new Date() })
      .where(eq(adminCredentialsTable.id, existing.id));
    return;
  }

  await db.insert(adminCredentialsTable).values({ passwordHash, salt });
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const [credential] = await db.select()
    .from(adminCredentialsTable)
    .limit(1);
  if (!credential) return false;

  const candidate = await derivePassword(password, credential.salt);
  const stored = Buffer.from(credential.passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
