/**
 * CLI — Generate Exchange Packets
 *
 * Generates listing packets for all supported exchanges and writes to disk.
 *
 * Usage: npx tsx src/cli/generate-packets.ts [exchange]
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ExchangePacketGenerator, SUPPORTED_EXCHANGES } from "../packet-generator.js";

const outDir = join(process.cwd(), "dist", "packets");
mkdirSync(outDir, { recursive: true });

const gen = new ExchangePacketGenerator();
const target = process.argv[2]?.toLowerCase();

if (target) {
  const packet = gen.generate(target);
  const filename = `${target}-packet.json`;
  writeFileSync(join(outDir, filename), JSON.stringify(packet, null, 2));
  console.log(`✅ Generated: ${filename}`);
} else {
  console.log(`Generating packets for ${SUPPORTED_EXCHANGES.length} exchanges...\n`);

  for (const ex of SUPPORTED_EXCHANGES) {
    const packet = gen.generate(ex);
    const filename = `${ex}-packet.json`;
    writeFileSync(join(outDir, filename), JSON.stringify(packet, null, 2));
    console.log(`  ✅ ${packet.exchange} → ${filename} (completeness: ${packet.completenessScore}%)`);
  }

  console.log(`\n📁 All packets written to: ${outDir}`);
}
