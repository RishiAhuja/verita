import { describe, expect, it } from "vitest";
import { calculateTieredAmountCents } from "@/lib/money";

const standardTiers = [
  { tierOrder: 0, upToUnits: 10_000, unitPriceMicroCents: 0 },
  { tierOrder: 1, upToUnits: 100_000, unitPriceMicroCents: 1_000 },
  { tierOrder: 2, upToUnits: null, unitPriceMicroCents: 500 },
];

describe("calculateTieredAmountCents", () => {
  it("applies free tier then paid tiers", () => {
    const lines = calculateTieredAmountCents(15_000, standardTiers);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      tierOrder: 0,
      quantityUnits: 10_000,
      amountCents: 0,
    });
    expect(lines[1]).toMatchObject({
      tierOrder: 1,
      quantityUnits: 5_000,
      amountCents: 500,
    });
  });

  it("handles usage beyond second tier", () => {
    const lines = calculateTieredAmountCents(150_000, standardTiers);

    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({
      tierOrder: 2,
      quantityUnits: 50_000,
      amountCents: 2500,
    });
  });
});
