import { reconcileStalePayments } from "@/services/reconciliation.service";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/services/reconciliation.service", () => ({
  reconcileStalePayments: vi.fn(),
}));

const summary = {
  examined: 1,
  outcomes: { synced: 1 },
  stalePending: [],
  failures: [],
};

const request = (authorization?: string) =>
  new Request("http://localhost/api/internal/reconcile", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(reconcileStalePayments).mockResolvedValue(summary as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/internal/reconcile", () => {
  test("refuses every request while no secret is configured", async () => {
    vi.stubEnv("RECONCILE_SECRET", "");

    const res = await POST(request("Bearer "));

    expect(res.status).toBe(503);
    expect(reconcileStalePayments).not.toHaveBeenCalled();
  });

  test.each([
    ["a missing header", undefined],
    ["a wrong secret", "Bearer wrong-secret"],
    ["a secret of a different length", "Bearer x"],
    ["a different scheme", "Basic correct-secret"],
    ["the secret without a scheme", "correct-secret"],
  ])("rejects %s", async (_label, header) => {
    vi.stubEnv("RECONCILE_SECRET", "correct-secret");

    const res = await POST(request(header));

    expect(res.status).toBe(401);
    expect(reconcileStalePayments).not.toHaveBeenCalled();
  });

  test("runs the reconciliation and returns the summary for the correct secret", async () => {
    vi.stubEnv("RECONCILE_SECRET", "correct-secret");

    const res = await POST(request("Bearer correct-secret"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(reconcileStalePayments).toHaveBeenCalledTimes(1);
  });

  test("answers 500 when the reconciliation throws", async () => {
    vi.stubEnv("RECONCILE_SECRET", "correct-secret");
    vi.mocked(reconcileStalePayments).mockRejectedValue(new Error("boom"));

    const res = await POST(request("Bearer correct-secret"));

    expect(res.status).toBe(500);
  });
});
