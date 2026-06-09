/** 1 cent = 10,000 micro-cents */
export const MICRO_CENTS_PER_CENT = 10_000;

export function microCentsToCents(microCents: number): number {
  return Math.round(microCents / MICRO_CENTS_PER_CENT);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

export function calculateTieredAmountCents(
  totalUnits: number,
  tiers: Array<{
    tierOrder: number;
    upToUnits: number | null;
    unitPriceMicroCents: number;
  }>,
): Array<{
  tierOrder: number;
  quantityUnits: number;
  unitPriceMicroCents: number;
  amountCents: number;
}> {
  const sorted = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  let remaining = totalUnits;
  let previousCap = 0;
  const lines: Array<{
    tierOrder: number;
    quantityUnits: number;
    unitPriceMicroCents: number;
    amountCents: number;
  }> = [];

  for (const tier of sorted) {
    if (remaining <= 0) {
      break;
    }

    const tierCapacity =
      tier.upToUnits === null ? remaining : tier.upToUnits - previousCap;
    const quantityUnits = Math.min(remaining, Math.max(tierCapacity, 0));

    if (quantityUnits > 0) {
      const amountMicroCents = quantityUnits * tier.unitPriceMicroCents;
      lines.push({
        tierOrder: tier.tierOrder,
        quantityUnits,
        unitPriceMicroCents: tier.unitPriceMicroCents,
        amountCents: microCentsToCents(amountMicroCents),
      });
      remaining -= quantityUnits;
    }

    if (tier.upToUnits !== null) {
      previousCap = tier.upToUnits;
    }
  }

  return lines;
}
