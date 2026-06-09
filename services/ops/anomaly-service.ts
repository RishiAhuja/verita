import { prisma } from "@verita/database";
import { subDays } from "date-fns";

export async function getCustomerAnomalies(customerId: string) {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  const oneDayAgo = subDays(now, 1);

  const [recentWindows, historicalWindows] = await Promise.all([
    prisma.usageWindow.findMany({
      where: {
        customerId,
        hourStart: { gte: oneDayAgo },
      },
    }),
    prisma.usageWindow.findMany({
      where: {
        customerId,
        hourStart: {
          gte: thirtyDaysAgo,
          lt: oneDayAgo,
        },
      },
    }),
  ]);

  const recentUnits = recentWindows.reduce((sum, row) => sum + row.totalUnits, 0);
  const historicalUnits = historicalWindows.reduce(
    (sum, row) => sum + row.totalUnits,
    0,
  );

  const historicalDays = 29;
  const historicalDailyAverage = historicalUnits / historicalDays;
  const recentDaily = recentUnits;

  const signals = [];

  if (historicalDailyAverage > 0 && recentDaily >= historicalDailyAverage * 10) {
    signals.push({
      type: "usage_spike",
      severity: "high",
      message: `Usage in the last 24h (${recentDaily} units) is ${(recentDaily / historicalDailyAverage).toFixed(1)}x the 30-day daily average (${historicalDailyAverage.toFixed(1)} units).`,
      recent_daily_units: recentDaily,
      average_daily_units: Number(historicalDailyAverage.toFixed(2)),
      multiplier: Number((recentDaily / historicalDailyAverage).toFixed(2)),
    });
  }

  return signals;
}
