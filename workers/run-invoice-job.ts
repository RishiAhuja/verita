import "dotenv/config";
import { runInvoiceGeneration } from "@/services/billing/invoice-service";

async function main() {
  const result = await runInvoiceGeneration();
  console.log("[invoice-job]", result);
}

main().catch((error) => {
  console.error("[invoice-job] failed", error);
  process.exit(1);
});
