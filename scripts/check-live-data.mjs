import { readFile } from "node:fs/promises";

const checks = [
  {
    file: "src/routes/crm.tsx",
    patterns: [
      [/@\/lib\/mock/, "CRM must not depend on mock data"],
      [/Example Company|templatePreviewValues/, "CRM templates must not substitute sample identities"],
    ],
  },
  {
    file: "src/routes/analytics.tsx",
    patterns: [
      [/@\/lib\/mock|AnalyticsDemo|revenueTrend|expectedCashByDay/, "Analytics routing must not use sample datasets"],
    ],
  },
  {
    file: "src/routes/cafe.tsx",
    patterns: [
      [/loadInvoices|saveInvoices|createInvoice\s*\(|PAYSTACK_PUBLIC_KEY|PaystackPop|tenant@example\.com|localStorage|createProductIllustration/, "Café flows must not use browser invoices, placeholder payment credentials, or generated sample assets"],
      [/\.from\(["']cafe_orders["']\)\s*\.insert/, "Café checkout must use the atomic server-side order RPC"],
      [/payment_status\s*:\s*["']Paid["']/, "Café payment state must only be confirmed server-side"],
    ],
    required: [
      [/rpc\(["']create_cafe_order["']/, "Café checkout must use create_cafe_order"],
      [/initialize-cafe-payment/, "Paystack initialization must use the server function"],
      [/verify-cafe-payment/, "Paystack return must use server verification"],
    ],
  },
];

let failed = false;
for (const check of checks) {
  const source = await readFile(check.file, "utf8");
  for (const [pattern, message] of check.patterns) {
    if (pattern.test(source)) {
      console.error(`FAIL ${check.file}: ${message}`);
      failed = true;
    }
  }
  for (const [pattern, message] of check.required ?? []) {
    if (!pattern.test(source)) {
      console.error(`FAIL ${check.file}: ${message}`);
      failed = true;
    }
  }
}

if (failed) process.exitCode = 1;
else console.log("Live-data checks passed for CRM, analytics, and café.");
