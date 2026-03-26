/**
 * CLI — Risk Scan
 *
 * Runs the risk engine against current state and prints results.
 *
 * Usage: npx tsx src/cli/risk-scan.ts
 */

import { RiskScanner } from "../risk-engine.js";

const scanner = new RiskScanner();
const flags = scanner.scan();
const summary = scanner.getSummary(flags);

console.log("═══════════════════════════════════════════════════════");
console.log("  Exchange Readiness OS — Risk Scan Report");
console.log("═══════════════════════════════════════════════════════\n");

console.log(`  Total Flags:  ${summary.totalFlags}`);
console.log(`  🔴 Critical:  ${summary.critical}`);
console.log(`  🟠 High:      ${summary.high}`);
console.log(`  🟡 Medium:    ${summary.medium}`);
console.log(`  🟢 Low:       ${summary.low}`);
console.log(`  ℹ️  Info:      ${summary.info}\n`);

console.log("  By Category:");
for (const [cat, count] of Object.entries(summary.byCategory)) {
  console.log(`    ${cat}: ${count} flag(s)`);
}

console.log("\n───────────────────────────────────────────────────────");
console.log("  BLOCKERS (must fix before listing)");
console.log("───────────────────────────────────────────────────────\n");

for (const b of summary.blockers) {
  const icon = b.severity === "critical" ? "🔴" : "🟠";
  console.log(`  ${icon} [${b.severity.toUpperCase()}] ${b.title}`);
  console.log(`     ${b.description}`);
  console.log(`     Exchange asks: "${b.exchangeQuestion}"`);
  console.log(`     Current answer: "${b.currentAnswer}"`);
  console.log(`     Mitigation: ${b.mitigation} [${b.mitigationStatus}]`);
  console.log("");
}

console.log("───────────────────────────────────────────────────────");
console.log("  RECOMMENDATIONS");
console.log("───────────────────────────────────────────────────────\n");

for (const r of summary.recommendations) {
  console.log(`  → ${r}`);
}

console.log("\n═══════════════════════════════════════════════════════\n");
