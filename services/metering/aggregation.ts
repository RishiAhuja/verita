import { JobName, prisma } from "@verita/database";
import { startOfHour, startOfMonth, subMonths } from "date-fns";

const LOCK_TTL_MS = 5 * 60 * 1000;

function hourBucket(date: Date) {
  return startOfHour(date);
}

export async function runUsageAggregation(params?: {
  workerId?: string;
  /** Defaults to start of two months ago so previous billing period is included */
  since?: Date;
}) {
  const workerId = params?.workerId ?? `worker-${process.pid}`;
  const now = new Date();
  const watermark = params?.since ?? startOfMonth(subMonths(now, 2));

  const job = await prisma.jobState.findUnique({
    where: { jobName: JobName.USAGE_AGGREGATOR },
  });

  if (
    job?.lockedAt &&
    job.lockedBy &&
    now.getTime() - job.lockedAt.getTime() < LOCK_TTL_MS
  ) {
    return { skipped: true, reason: "lock_held" as const };
  }

  await prisma.jobState.upsert({
    where: { jobName: JobName.USAGE_AGGREGATOR },
    create: {
      jobName: JobName.USAGE_AGGREGATOR,
      watermark,
      lockedAt: now,
      lockedBy: workerId,
    },
    update: {
      lockedAt: now,
      lockedBy: workerId,
    },
  });

  try {
    const events = await prisma.usageEvent.findMany({
      where: { occurredAt: { gte: watermark, lte: now } },
      select: {
        customerId: true,
        apiKeyId: true,
        endpoint: true,
        units: true,
        occurredAt: true,
      },
    });

    const grouped = new Map<
      string,
      {
        customerId: string;
        apiKeyId: string;
        endpoint: string;
        hourStart: Date;
        totalUnits: number;
        eventCount: number;
      }
    >();

    for (const event of events) {
      const hourStart = hourBucket(event.occurredAt);
      const key = `${event.customerId}:${event.apiKeyId}:${event.endpoint}:${hourStart.toISOString()}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.totalUnits += event.units;
        existing.eventCount += 1;
      } else {
        grouped.set(key, {
          customerId: event.customerId,
          apiKeyId: event.apiKeyId,
          endpoint: event.endpoint,
          hourStart,
          totalUnits: event.units,
          eventCount: 1,
        });
      }
    }

    let windowsUpserted = 0;

    for (const window of grouped.values()) {
      await prisma.usageWindow.upsert({
        where: {
          customerId_apiKeyId_endpoint_hourStart: {
            customerId: window.customerId,
            apiKeyId: window.apiKeyId,
            endpoint: window.endpoint,
            hourStart: window.hourStart,
          },
        },
        create: {
          customerId: window.customerId,
          apiKeyId: window.apiKeyId,
          endpoint: window.endpoint,
          hourStart: window.hourStart,
          totalUnits: window.totalUnits,
          eventCount: window.eventCount,
        },
        update: {
          totalUnits: window.totalUnits,
          eventCount: window.eventCount,
        },
      });
      windowsUpserted += 1;
    }

    await prisma.jobState.update({
      where: { jobName: JobName.USAGE_AGGREGATOR },
      data: {
        watermark: now,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return {
      skipped: false,
      eventsProcessed: events.length,
      windowsUpserted,
    };
  } catch (error) {
    await prisma.jobState.update({
      where: { jobName: JobName.USAGE_AGGREGATOR },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });
    throw error;
  }
}
