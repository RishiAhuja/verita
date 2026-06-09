import "dotenv/config";
import { runUsageAggregation } from "@/services/metering/aggregation";

async function main() {
  const result = await runUsageAggregation();
  console.log("[usage-aggregator]", result);
}

main().catch((error) => {
  console.error("[usage-aggregator] failed", error);
  process.exit(1);
});
