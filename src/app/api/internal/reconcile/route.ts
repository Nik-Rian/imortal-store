import crypto from "node:crypto";
import { reconcileStalePayments } from "@/services/reconciliation.service";
import { NextResponse } from "next/server";

const BEARER_PREFIX = "Bearer ";

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

/**
 * Compares SHA-256 digests so that timingSafeEqual always receives buffers of
 * equal length and neither the content nor the length of the secret is
 * observable through timing.
 */
function hasValidBearerSecret(
  authorizationHeader: string | null,
  secret: string,
): boolean {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false;
  const provided = authorizationHeader.slice(BEARER_PREFIX.length);
  return crypto.timingSafeEqual(digest(provided), digest(secret));
}

export async function POST(req: Request) {
  const secret = process.env.RECONCILE_SECRET;

  // Fail closed: without a configured secret no caller can be authorized.
  if (!secret) {
    console.error(
      "Reconcile route refused: RECONCILE_SECRET is not configured.",
    );
    return NextResponse.json(
      { error: "Reconciliation is not configured" },
      { status: 503 },
    );
  }

  if (!hasValidBearerSecret(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcileStalePayments();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Reconcile route failed:", error);
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 500 },
    );
  }
}
