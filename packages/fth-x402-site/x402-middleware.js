// x402-middleware.js (CommonJS version for compatibility)
// Production-ready x402 micro-payment middleware for Genesis402 Task Center
// Supports multiple networks: Base (Coinbase), Solana, Apostle 7332

// Block Any Remaining Demo Paths
if (process.env.SIMULATION_MODE !== "false") {
  console.error("CRITICAL ERROR: SIMULATION_MODE is still enabled!");
  process.exit(1);
}

const { paymentMiddleware } = require('@x402/express');
require('./genesis402-env');

const payTo = process.env.PAY_TO_ADDRESS || process.env.SOVEREIGN_PAY_TO;
if (!payTo) throw new Error("x402-middleware: PAY_TO_ADDRESS (or SOVEREIGN_PAY_TO) must be configured; refusing to load without a pay-to address");
const FACILITATOR_URL = process.env.X402_FACILITATOR || "https://api.cdp.coinbase.com/platform/v2/x402"; // Coinbase for Base

const x402Config = {
  "POST /task": {
    description: "Genesis402 Sovereign Task - XRPL Primary (cheap via troptions exchange)",
    accepts: [
      { 
        scheme: "exact", 
        price: "0.05", 
        asset: "XRP", 
        network: "xrpl:mainnet", 
        payTo: process.env.XRP_PAY_TO || "rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC" 
      },
      { 
        scheme: "exact", 
        price: "0.05", 
        asset: "RLUSD", 
        network: "xrpl:mainnet", 
        payTo: process.env.X402_RLUSD_PAY_TO || "rsJ3PGGDH4vPpedjfVRe9YKTCf9BWu6TDC",
        issuer: process.env.RLUSD_ISSUER || "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"
      },
      { 
        scheme: "exact", 
        price: "0.05", 
        asset: "USDC", 
        network: "stellar:mainnet", 
        payTo: "GBJF54FBYPBVHR6Z3OKWWEMPF6QYPNH3RZZYX3E4V7AUMUWIEV7Z3DPX" 
      },
      { 
        scheme: "exact", 
        price: "0.25", 
        asset: "USDC", 
        network: "eip155:8453", 
        payTo: payTo,
        facilitator: process.env.X402_FACILITATOR
      }
    ]
  },
  "POST /rwa-screen": { price: "0.75", asset: "USDC", network: "eip155:8453" },
  "POST /genesis-sim": { price: "0.10", asset: "USDC", network: "eip155:8453" },
  "POST /wallet-ops": { price: "0.05", asset: "USDC", network: "eip155:8453" }
};

const x402Protected = paymentMiddleware(payTo, x402Config, {
  // Full automation on success - logs real on-chain receipts
  onPaymentSuccess: async (req, payment) => {
    req.x402Receipt = {
      id: `x402-${Date.now()}`,
      tx: payment.transactionHash,
      network: payment.network,
      amount: payment.amount,
      asset: payment.asset,
      timestamp: new Date().toISOString(),
      status: "confirmed"
    };

    console.log(`✅ REAL AUTOMATED PAYMENT RECEIVED → ${payment.amount} ${payment.asset} on ${payment.network} | Tx: ${payment.transactionHash}`);
    return true;
  }
});

module.exports = { x402Protected };