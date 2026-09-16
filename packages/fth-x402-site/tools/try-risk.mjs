#!/usr/bin/env node
// try-risk.mjs — pay for one Genesis402 risk snapshot from a Base USDC wallet you control, using x402 v2.
//
//   1. npm install viem            (once, in any folder)
//   2. TESTER_KEY=0x<private key> node try-risk.mjs 0x<address to check> [base|polygon]
//
// What happens: the script asks https://twin.unykorn.org/risk for its terms (HTTP 402), signs a USDC
// transferWithAuthorization for exactly the quoted amount (0.25 USDC on Base), re-sends the request with the
// signed authorization in the X-PAYMENT header, and prints the risk snapshot plus the receipt. The rail's
// facilitator submits the transfer and pays the gas: the wallet needs USDC on Base and no ETH.
// Your private key never leaves this process. Nothing is sent anywhere except the signed authorization for
// this one payment, which can only move the quoted amount to the quoted address and expires in 10 minutes.
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'node:crypto';

const RAIL = process.env.RAIL_ORIGIN || 'https://twin.unykorn.org';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const key = process.env.TESTER_KEY;
const subject = process.argv[2];
const chain = (process.argv[3] || 'base').toLowerCase();

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) { console.error('TESTER_KEY must be a 0x-prefixed 64-hex private key (set it as an environment variable, never paste it into chat).'); process.exit(2); }
if (!subject || !/^0x[0-9a-fA-F]{40}$/.test(subject)) { console.error('usage: TESTER_KEY=0x… node try-risk.mjs 0x<address to check> [base|polygon]'); process.exit(2); }

const account = privateKeyToAccount(key);
const body = JSON.stringify({ params: { address: subject, chain } });
const headers = { 'content-type': 'application/json', 'user-agent': 'genesis402-try-risk/1.0' };

console.log('payer wallet :', account.address);
console.log('subject      :', subject, 'on', chain);

// 1. Ask for terms.
const first = await fetch(RAIL + '/risk', { method: 'POST', headers, body });
const challenge = await first.json();
if (first.status !== 402) { console.log('rail answered', first.status, JSON.stringify(challenge).slice(0, 300)); process.exit(1); }
const accept = (challenge.accepts || []).find((a) => a.network === 'eip155:8453');
if (!accept) { console.error('no Base USDC lane offered:', (challenge.accepts || []).map((a) => a.network)); process.exit(1); }
const amount = String(accept.maxAmountRequired || accept.amount);
console.log('quoted price :', Number(amount) / 1e6, 'USDC on Base ->', accept.payTo);

// 2. Sign exactly that amount to exactly that address (EIP-3009). The nonce is random; the window is 10 minutes.
const now = Math.floor(Date.now() / 1000);
const authorization = { from: account.address, to: accept.payTo, value: amount, validAfter: '0', validBefore: String(now + 600), nonce: '0x' + randomBytes(32).toString('hex') };
const signature = await account.signTypedData({
  domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC_BASE },
  types: { TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' } ] },
  primaryType: 'TransferWithAuthorization',
  message: { from: authorization.from, to: authorization.to, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(authorization.validBefore), nonce: authorization.nonce }
});
const xPayment = Buffer.from(JSON.stringify({ x402Version: 2, scheme: 'exact', network: 'eip155:8453', payload: { signature, authorization } })).toString('base64');

// 3. Pay and receive.
const paid = await fetch(RAIL + '/risk', { method: 'POST', headers: { ...headers, 'X-PAYMENT': xPayment }, body });
const result = await paid.json();
if (paid.status !== 200) { console.log('not delivered:', paid.status, JSON.stringify(result).slice(0, 600)); process.exit(1); }

const r = result.receipt || {};
console.log('\nPAID + DELIVERED');
console.log('receipt      :', r.receipt_id, '| tx', r.tx_hash, '| settled by', r.settled_by, '| payer class', r.internal === true ? 'internal' : r.internal === false ? 'external / tester' : 'unknown');
console.log('explorer     : https://base.blockscout.com/tx/' + r.tx_hash);
console.log('public feed  :', RAIL + '/receipts/' + r.receipt_id);
console.log('verdict      :', result.verdict, '| score', result.score, '| kind', result.subject && result.subject.kind);
for (const s of result.signals || []) console.log('  -', s.severity.padEnd(11), s.name.padEnd(36), s.evidence);
console.log('evidence hash:', result.evidence_hash);
console.log('\nfull JSON follows\n' + JSON.stringify(result, null, 2));
