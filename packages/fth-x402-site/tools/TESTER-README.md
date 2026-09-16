# Try a paid call on the Genesis402 rail (5 minutes, no account)

You have been given a small Base USDC wallet by UnyKorn LLC so you can see how an x402 pay-per-call API works.
The wallet holds under a dollar. Each call costs 0.25 USDC. Nothing else on the wallet does anything.

## What you need

- Node.js 20 or newer (https://nodejs.org)
- The key you were given (a line starting with `0x`, 66 characters). Treat it like cash: do not paste it into chat, email, or a web page.
- The script `try-risk.mjs` from https://github.com/FTHTrading/UnyKorn-X402-aws/blob/main/packages/fth-x402-site/tools/try-risk.mjs

## Run it

```bash
mkdir g402 && cd g402
npm init -y >/dev/null && npm install viem
curl -O https://raw.githubusercontent.com/FTHTrading/UnyKorn-X402-aws/main/packages/fth-x402-site/tools/try-risk.mjs
```

Windows PowerShell:

```powershell
$env:TESTER_KEY = "0x<your key>"
node try-risk.mjs 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed base
```

macOS / Linux:

```bash
TESTER_KEY=0x<your key> node try-risk.mjs 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed base
```

Replace the address with any wallet, token, or contract on Base (or add `polygon`).

## What you will see

1. The rail answers with HTTP 402 and its terms: price, asset, and the address it is paid to.
2. The script signs a USDC authorization for exactly that amount and re-sends the request.
3. You get back the risk snapshot: verdict, score, every signal with the dataset it came from, the sources with URLs, an evidence hash, and a receipt with the Base transaction hash.
4. The receipt appears within a second at https://twin.unykorn.org/receipts labelled **tester**, and the transfer is on https://base.blockscout.com under that hash.

## What we are asking of you

Send back three things: the `receipt_id`, one line on whether the result was useful for a decision, and anything confusing.
That is the whole ask. This is a usability test of live settlement, not a sale, and nothing in the response is investment, legal, or tax advice.

## Terms and machine docs

- Terms and lanes: https://twin.unykorn.org/.well-known/x402
- OpenAPI: https://twin.unykorn.org/openapi.json
- Agent card: https://twin.unykorn.org/.well-known/agent.json
