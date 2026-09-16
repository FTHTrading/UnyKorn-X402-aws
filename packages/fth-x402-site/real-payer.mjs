// real-payer.mjs
// Real client-side x402 payer for Base mainnet (and extensible to other networks).
// Performs actual USDC transfer to payTo from a funded PAYER_PRIVATE_KEY.
// Then retries the task POST with X-PAYMENT header containing the on-chain proof.
// Used by business-agent.js (via dynamic import) and can be used by UI/Task Center later.
//
// All USDC / Base details are built-in (no chasing docs):
//   USDC_BASE, ERC20_TRANSFER_ABI, BASE_CHAIN
//
// IMPORTANT:
// - Set PAYER_PRIVATE_KEY in .env (0x... for a Base wallet that holds USDC).
// - Fund it with small USDC on Base (e.g. 5-10 USDC for testing cycles).
// - This spends REAL USDC on Base mainnet to the sovereign payTo.
// - Per sovereign rules: on-chain spends require human approval / funded test key only.
// - For "several" networks: currently prioritizes eip155:8453 (Base/Coinbase). Extend for solana etc.

import { createRequire } from 'module';
import { createPublicClient, createWalletClient, http, parseUnits, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Client as XrplClient, Wallet as XrplWallet, xrpToDrops } from 'xrpl';

const require = createRequire(import.meta.url);
require('./genesis402-env.js');

const XRPL_TREASURY_DEFAULT = 'rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC';
const XRPL_DISTRIBUTOR_DEFAULT = 'rNX4faQ35SdtE4rDoEg8YeVLQKQ57AYyCt';

/** Spend wallet + destination; never pay Account === Destination (temREDUNDANT). */
function resolveXrplPayment(payToFrom402) {
  const treasury =
    process.env.XRPL_TREASURY_ADDRESS ||
    process.env.XRP_PAY_TO ||
    XRPL_TREASURY_DEFAULT;
  const distributorAddr =
    process.env.XRPL_DISTRIBUTOR_ADDRESS ||
    process.env.TROPTIONS_XRPL_DISTRIBUTION ||
    XRPL_DISTRIBUTOR_DEFAULT;

  let destination = payToFrom402 || treasury;
  if (destination.startsWith('0x')) destination = treasury;

  let spendSeed =
    process.env.XRPL_PAYER_SEED || process.env.XRPL_DISTRIBUTOR_SEED;
  if (!spendSeed) {
    throw new Error(
      'XRPL_PAYER_SEED missing in env. Set XRPL_DISTRIBUTOR_SEED for spend and XRPL_TREASURY_ADDRESS for payTo.'
    );
  }

  let wallet = XrplWallet.fromSeed(spendSeed);

  if (wallet.address === destination) {
    const distSeed = process.env.XRPL_DISTRIBUTOR_SEED;
    if (distSeed && wallet.address !== XrplWallet.fromSeed(distSeed).address) {
      wallet = XrplWallet.fromSeed(distSeed);
      spendSeed = distSeed;
    }
    destination = treasury;
  }

  if (wallet.address === destination) {
    if (wallet.address === treasury && distributorAddr !== treasury) {
      const distSeed = process.env.XRPL_DISTRIBUTOR_SEED;
      if (!distSeed) {
        throw new Error(
          `XRPL payment blocked: payTo (${destination}) equals payer (${wallet.address}). Set XRPL_DISTRIBUTOR_SEED to spend from ${distributorAddr}.`
        );
      }
      wallet = XrplWallet.fromSeed(distSeed);
    } else {
      throw new Error(
        `XRPL payment blocked: Destination (${destination}) cannot equal Account (${wallet.address}).`
      );
    }
  }

  if (wallet.address === destination) {
    throw new Error(
      `XRPL payment blocked: Destination (${destination}) equals Account (${wallet.address}). Configure distinct treasury and distributor seeds.`
    );
  }

  return { wallet, destination, spendFrom: wallet.address };
}

const recentXrplPayments = new Map();

// === 1. USDC Contract Details (official native USDC on Base) ===
const USDC_BASE = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  decimals: 6,
  symbol: "USDC",
  chainId: 8453,
  rpc: "https://mainnet.base.org"
};

// === 2. Minimal ERC20 ABI (transfer + balanceOf for pre-checks) ===
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  }
];

// Keep alias for transfer-only if needed elsewhere
const ERC20_TRANSFER_ABI = ERC20_ABI;

// === 3. Base Chain Config ===
const BASE_CHAIN = {
  id: 8453,
  name: "Base",
  rpc: "https://mainnet.base.org",
  explorer: "https://basescan.org"
};

let cachedClients = null;

function getClients() {
  if (cachedClients) return cachedClients;

  const payerKey = process.env.PAYER_PRIVATE_KEY;
  if (!payerKey || !payerKey.startsWith('0x')) {
    throw new Error('PAYER_PRIVATE_KEY missing or invalid in env. Fund a Base USDC test wallet and set it (never commit real keys).');
  }

  const account = privateKeyToAccount(payerKey);
  const rpc =
    (process.env.USE_CF_WEB3_RPC === 'true' ? process.env.CF_WEB3_GATEWAY : null) ||
    process.env.BASE_RPC ||
    process.env.CF_WEB3_GATEWAY ||
    USDC_BASE.rpc;
  const publicClient = createPublicClient({ 
    chain: base, 
    transport: http(rpc) 
  });
  const walletClient = createWalletClient({ 
    account, 
    chain: base, 
    transport: http(rpc) 
  });

  cachedClients = { publicClient, walletClient, account };
  return cachedClients;
}

/** Pay 402 task using cheapest configured rail (XRPL → Stellar → Base). */
export async function payAndRetry(taskBody, taskUrl = process.env.TASK_URL || 'http://127.0.0.1:3101/task') {
  const preferred = (process.env.PREFERRED_X402_RAIL || 'xrpl,stellar,base').split(',').map((s) => s.trim());

  // 1. Initial call - expect 402 with accepts descriptor
  let res = await fetch(taskUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskBody)
  });

  if (res.status !== 402) {
    // Already paid or no enforcement hit (e.g. health paths). Return as-is.
    try { return await res.json(); } catch { return { status: res.status }; }
  }

  const descriptor = await res.json();
  let requirement = (descriptor.accepts && descriptor.accepts[0]) ? descriptor.accepts[0] : descriptor;

  let network = requirement.network || 'eip155:8453';
  let asset = requirement.asset || 'USDC';
  let payTo = requirement.payTo || process.env.PAY_TO_ADDRESS || '0x7d9a65d06dcc435a52D5880C6310Bd6E96c156DB';
  let priceStr = requirement.price || requirement.amount || '0.25';

  // Pick cheapest rail from 402 accepts[] when present
  const accepts = descriptor.accepts || [];
  if (accepts.length) {
    for (const rail of preferred) {
      const match = accepts.find((a) => (a.network || '').includes(rail) || (rail === 'base' && (a.network || '').includes('8453')));
      if (match) {
        network = match.network;
        asset = match.asset || asset;
        payTo = match.payTo || payTo;
        priceStr = match.price || match.amount || priceStr;
        requirement = match;
        break;
      }
    }
  }

  // Support cheap XRPL rail (use troptions exchange to get XRP/RLUSD cheaply, pay on XRPL)
  if (network.includes('xrpl')) {
    const idemKey = `${taskUrl}:${JSON.stringify(taskBody)}:${network}:${priceStr}`;
    const cached = recentXrplPayments.get(idemKey);
    if (cached && Date.now() - cached.at < 120_000) {
      const retryRes = await fetch(taskUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PAYMENT': JSON.stringify(cached.proof) },
        body: JSON.stringify(taskBody),
      });
      return retryRes.json();
    }

    const { wallet: xrplWallet, destination: xrplDest, spendFrom } = resolveXrplPayment(payTo);
    const xrplClient = new XrplClient(process.env.XRPL_WSS_URL || process.env.XRPL_SERVER || 'wss://xrplcluster.com');
    await xrplClient.connect();
    const payAsset = requirement.asset || 'XRP';
    let amount;
    let logAsset = payAsset;
    if (payAsset === 'XRP' || payAsset === 'xrp') {
      amount = xrpToDrops(String(priceStr));
    } else if (payAsset === 'RLUSD') {
      const issuer = process.env.RLUSD_ISSUER || 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
      amount = { currency: 'RLUSD', issuer, value: String(priceStr) };
      // Note: payer account must have trustline to RLUSD issuer for this to succeed.
      // Use troptions exchange-os /api/xrpl/prepare-trustline if needed.
    } else {
      amount = xrpToDrops(String(priceStr)); // fallback
    }
    if (xrplWallet.address === xrplDest) {
      throw new Error(
        `[xrpl-payer] Refusing submit: Account and Destination both ${xrplWallet.address}. Use XRPL_DISTRIBUTOR_SEED for spend.`
      );
    }
    const tx = await xrplClient.autofill({
      TransactionType: 'Payment',
      Account: xrplWallet.address,
      Destination: xrplDest,
      Amount: amount,
    });
    const signed = xrplWallet.sign(tx);
    const result = await xrplClient.submitAndWait(signed.tx_blob);
    const txHash = result.result.hash;
    await xrplClient.disconnect();
    console.log(
      `[xrpl-payer] Paid ${priceStr} ${logAsset} from ${spendFrom} to ${xrplDest}, tx ${txHash}`
    );
    const paymentProof = {
      scheme: 'exact',
      network,
      asset: logAsset,
      payTo: xrplDest,
      price: priceStr,
      txHash,
    };
    recentXrplPayments.set(idemKey, { at: Date.now(), proof: paymentProof });
    const retryRes = await fetch(taskUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PAYMENT': JSON.stringify(paymentProof) },
      body: JSON.stringify(taskBody)
    });
    return retryRes.json();
  }

  if (network.includes('stellar')) {
    const sSecret = process.env.STELLAR_PAYER_SECRET || process.env.STELLAR_TREASURY_SECRET;
    if (!sSecret) {
      throw new Error('STELLAR_PAYER_SECRET missing — add STELLAR_TREASURY_SECRET to master seeds');
    }
    const StellarSdk = (await import('@stellar/stellar-sdk')).default;
    const kp = StellarSdk.Keypair.fromSecret(sSecret);
    const server = new StellarSdk.Horizon.Server(process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org');
    const account = await server.loadAccount(kp.publicKey());
    const usdcIssuer = process.env.STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    const usdc = new StellarSdk.Asset('USDC', usdcIssuer);
    const dest = payTo || process.env.STELLAR_TREASURY;
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.PUBLIC,
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: dest,
        asset: usdc,
        amount: String(priceStr),
      }))
      .setTimeout(30)
      .build();
    tx.sign(kp);
    const result = await server.submitTransaction(tx);
    const txHash = result.hash;
    console.log(`[stellar-payer] Paid ${priceStr} USDC to ${dest}, tx ${txHash}`);
    const paymentProof = { scheme: 'exact', network, asset: 'USDC', payTo: dest, price: priceStr, txHash };
    const retryRes = await fetch(taskUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PAYMENT': JSON.stringify(paymentProof) },
      body: JSON.stringify(taskBody),
    });
    return retryRes.json();
  }

  if (!network.includes('eip155:8453') && !network.includes('base')) {
    // Real pay is implemented for Base only. Never send a forged proof for another network.
    throw new Error(`[real-payer] network ${network} not supported by this payer; no request was sent`);
  }

  // 2. Real on-chain payment: USDC transfer on Base (needs ETH gas on payer)
  const { publicClient, walletClient, account } = getClients();
  const amount = parseUnits(String(priceStr), USDC_BASE.decimals);

  console.log(`[real-payer] Paying ${priceStr} ${asset} on ${network} to ${payTo} (amount=${amount}) from payer using built-in ${USDC_BASE.symbol} on ${BASE_CHAIN.name} (chainId ${BASE_CHAIN.id})`);

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [payTo, amount]
  });

  const txHash = await walletClient.sendTransaction({
    to: USDC_BASE.address,
    data,
    value: 0n,
    // gas will be estimated by viem/wallet
  });

  console.log(`[real-payer] USDC transfer sent: ${txHash}. Waiting for receipt...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error(`Payment tx failed: ${txHash}`);
  }

  console.log(`[real-payer] Payment confirmed in block ${receipt.blockNumber}. Retrying task with X-PAYMENT proof...`);

  // 3. Retry with proof in X-PAYMENT header.
  // Format chosen to be compatible with current task-server verifyPaymentWithFacilitator (forwards to CDP /verify).
  // In full x402 + CDP, this would be the canonical payment payload (tx + auth if using EIP-3009).
  const paymentProof = {
    scheme: 'exact',
    network: `eip155:${BASE_CHAIN.id}`,
    asset: USDC_BASE.symbol,
    payTo,
    price: priceStr,
    txHash: receipt.transactionHash,
    blockNumber: Number(receipt.blockNumber),
    from: receipt.from,
    // Facilitator can verify the transfer on-chain to payTo >= price
  };

  const retryRes = await fetch(taskUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': JSON.stringify(paymentProof)
    },
    body: JSON.stringify(taskBody)
  });

  const result = await retryRes.json();

  // Attach payer metadata for logging/evidence
  result.x402Payer = {
    txHash: receipt.transactionHash,
    paidAmount: priceStr,
    network: `eip155:${BASE_CHAIN.id}`,
    payTo,
    timestamp: new Date().toISOString(),
    usdcContract: USDC_BASE.address
  };

  return result;
}

export default { payAndRetry };
