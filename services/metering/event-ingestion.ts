import { prisma } from "@verita/database";
import { z } from "zod";

export const usageEventSchema = z.object({
  request_id: z.string().min(1),
  api_key_id: z.string().uuid(),
  endpoint: z.string().min(1),
  units: z.number().int().positive(),
  timestamp: z.coerce.date(),
});

export const ingestEventsSchema = z.object({
  events: z.array(usageEventSchema).min(1).max(500),
});

export type IngestEventsInput = z.infer<typeof ingestEventsSchema>;

export async function ingestUsageEvents(params: {
  customerId: string;
  events: IngestEventsInput["events"];
}) {
  let accepted = 0;
  let duplicates = 0;

  for (const event of params.events) {
    const result = await prisma.usageEvent.createMany({
      data: [
        {
          requestId: event.request_id,
          customerId: params.customerId,
          apiKeyId: event.api_key_id,
          endpoint: event.endpoint,
          units: event.units,
          occurredAt: event.timestamp,
        },
      ],
      skipDuplicates: true,
    });

    if (result.count === 1) {
      accepted += 1;
    } else {
      duplicates += 1;
    }
  }

  return { accepted, duplicates, total: params.events.length };
}
