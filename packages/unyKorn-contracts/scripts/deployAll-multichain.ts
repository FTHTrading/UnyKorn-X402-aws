/**
 * scripts/deployAll-multichain.ts
 *
 * Deploys UNYToken + FTHStablecoin to ALL configured EVM chains.
 * Skips chains where the contract is already deployed (address in .env).
 *
 * Usage (run per-network with hardhat):
 *   npx hardhat run scripts/deployAll-multichain.ts --network polygon
 *   npx hardhat run scripts/deployAll-multichain.ts --network base
 *   npx hardhat run scripts/deployAll-multichain.ts --network avalanche
 *
 * Or deploy individually:
 *   npx hardhat run scripts/deploy.ts --network polygon
 *   npx hardhat run scripts/deployFTHStablecoin.ts --network base
 */

import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";

const OUT_DIR = resolve(__dirname, "../../../exports/deployments");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const netName = network.name.toUpperCase();

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  UnyKorn Multi-Token Deploy — UNY + FTH_USD                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`  Network  : ${network.name} (chainId ${chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} native`);
  console.log("─────────────────────────────────────────────────────────────\n");

  mkdirSync(OUT_DIR, { recursive: true });

  const results: { token: string; address: string }[] = [];

  // ── Deploy UNY ────────────────────────────────────────────────────────
  const unyEnvKey = `UNY_${netName}_ADDRESS`;
  const existingUNY = process.env[unyEnvKey];

  if (existingUNY && existingUNY.startsWith("0x")) {
    console.log(`  ⏭️  UNY already deployed at ${existingUNY} — skipping`);
    results.push({ token: "UNY", address: existingUNY });
  } else {
    console.log("  [1/2] Deploying UNYToken...");
    const UNYFactory = await ethers.getContractFactory("UNYToken");
    const uny = await UNYFactory.deploy(deployer.address);
    await uny.waitForDeployment();
    const unyAddr = await uny.getAddress();
    console.log(`  ✅ UNY deployed at ${unyAddr}`);

    const artefact = {
      name: "UNYToken", symbol: "UNY", chain: network.name,
      chainId: chainId.toString(), address: unyAddr,
      deployer: deployer.address, deployed_at: new Date().toISOString(),
    };
    writeFileSync(resolve(OUT_DIR, `${network.name}-UNYToken.json`), JSON.stringify(artefact, null, 2));
    results.push({ token: "UNY", address: unyAddr });
  }

  // ── Deploy FTH_USD ─────────────────────────────────────────────────────
  const fthusdEnvKey = `FTH_USD_${netName}_ADDRESS`;
  const existingFTHUSD = process.env[fthusdEnvKey];

  if (existingFTHUSD && existingFTHUSD.startsWith("0x")) {
    console.log(`  ⏭️  FTH_USD already deployed at ${existingFTHUSD} — skipping`);
    results.push({ token: "FTH_USD", address: existingFTHUSD });
  } else {
    console.log("  [2/2] Deploying FTHStablecoin...");
    const FTHFactory = await ethers.getContractFactory("FTHStablecoin");
    const fthusd = await FTHFactory.deploy(deployer.address);
    await fthusd.waitForDeployment();
    const fthusdAddr = await fthusd.getAddress();
    console.log(`  ✅ FTH_USD deployed at ${fthusdAddr}`);

    const artefact = {
      name: "FTHStablecoin", symbol: "FTH_USD", chain: network.name,
      chainId: chainId.toString(), address: fthusdAddr, decimals: 6,
      deployer: deployer.address, deployed_at: new Date().toISOString(),
    };
    writeFileSync(resolve(OUT_DIR, `${network.name}-FTHStablecoin.json`), JSON.stringify(artefact, null, 2));
    results.push({ token: "FTH_USD", address: fthusdAddr });
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n  ═══════════════════════════════════════════════════════");
  console.log(`  ${network.name} Deployment Complete`);
  console.log("  ═══════════════════════════════════════════════════════");
  for (const r of results) {
    console.log(`    ${r.token.padEnd(10)} → ${r.address}`);
  }
  console.log("\n  Add to .env:");
  for (const r of results) {
    const key = r.token === "UNY" ? unyEnvKey : fthusdEnvKey;
    console.log(`    ${key}=${r.address}`);
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
