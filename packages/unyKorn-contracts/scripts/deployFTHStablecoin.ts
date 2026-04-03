/**
 * scripts/deployFTHStablecoin.ts
 *
 * Deploys FTHStablecoin (FTH_USD) to the selected network.
 * The contract is a mintable ERC-20 with 6 decimals (USDC-style).
 *
 * Usage:
 *   npx hardhat run scripts/deployFTHStablecoin.ts --network avalanche
 *   npx hardhat run scripts/deployFTHStablecoin.ts --network polygon
 *   npx hardhat run scripts/deployFTHStablecoin.ts --network base
 *
 * After deploy:
 *  1. Record the address in .env (FTH_USD_<CHAIN>_ADDRESS)
 *  2. Verify on block explorer
 *  3. Register in VaultRegistry
 */

import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║  FTH Stablecoin (FTH_USD) — deploy                    ║");
  console.log("╚═══════════════════════════════════════════════════════╝");
  console.log(`  Network   : ${network.name} (chainId ${chainId})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} native`);
  console.log("───────────────────────────────────────────────────────\n");

  const Factory = await ethers.getContractFactory("FTHStablecoin");
  const token = await Factory.deploy(deployer.address);
  await token.waitForDeployment();

  const address = await token.getAddress();
  const symbol = await token.symbol();
  const dec = await token.decimals();

  console.log(`  ✅ ${symbol} deployed`);
  console.log(`     Address  : ${address}`);
  console.log(`     Decimals : ${dec}`);
  console.log(`     Owner    : ${deployer.address}`);
  console.log();

  // ── Optional: Mint initial treasury supply ──────────────────────────────
  const INITIAL_MINT = process.env.FTH_USD_INITIAL_MINT || "0";
  if (INITIAL_MINT !== "0") {
    const mintAmount = ethers.parseUnits(INITIAL_MINT, 6);
    const mintTx = await token.mint(deployer.address, mintAmount);
    await mintTx.wait();
    console.log(`  ✅ Minted ${INITIAL_MINT} FTH_USD to deployer`);
    console.log();
  }

  // ── Persist deployment artefact ─────────────────────────────────────────
  const artefact = {
    name: "FTHStablecoin",
    symbol: "FTH_USD",
    chain: network.name,
    chainId: chainId.toString(),
    address,
    decimals: Number(dec),
    deployer: deployer.address,
    deployed_at: new Date().toISOString(),
    initialMint: INITIAL_MINT,
  };

  const outDir = resolve(__dirname, "../../../exports/deployments");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${network.name}-FTHStablecoin.json`);
  writeFileSync(outFile, JSON.stringify(artefact, null, 2));
  console.log(`  📄 Artefact saved → ${outFile}\n`);

  console.log("  .env entries to add:");
  console.log(`  FTH_USD_${network.name.toUpperCase()}_ADDRESS=${address}`);
  console.log(`  FTH_USD_${network.name.toUpperCase()}_CHAIN_ID=${chainId}`);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
