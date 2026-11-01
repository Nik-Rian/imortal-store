import { describe, expect, it } from "vitest";
import { capInstallments } from "./card-installments";

const costs = (...values: (number | string)[]) =>
  values.map((installments) => ({
    installments,
    recommended_message: `${installments}x de teste`,
  }));

describe("capInstallments", () => {
  it("drops options above the maximum", () => {
    expect(
      capInstallments(costs(1, 2, 3, 4, 5, 6)).map((o) => o.installments),
    ).toEqual([1, 2, 3]);
  });

  it("accepts string installments from the provider", () => {
    expect(
      capInstallments(costs("1", "2", "4")).map((o) => o.installments),
    ).toEqual([1, 2]);
  });

  it("uses the provider message, falling back to Nx", () => {
    const [first, second] = capInstallments([
      { installments: 1, recommended_message: " 1x de R$ 50,00 " },
      { installments: 2, recommended_message: "" },
    ]);
    expect(first.label).toBe("1x de R$ 50,00");
    expect(second.label).toBe("2x");
  });

  it("ignores invalid and duplicate entries", () => {
    expect(
      capInstallments(costs(0, -1, 1.5, "abc", 2, 2)).map(
        (o) => o.installments,
      ),
    ).toEqual([2]);
  });

  it("honours a custom maximum and empty input", () => {
    expect(capInstallments(costs(1, 2, 3), 1)).toHaveLength(1);
    expect(capInstallments(null)).toEqual([]);
    expect(capInstallments([])).toEqual([]);
  });
});
