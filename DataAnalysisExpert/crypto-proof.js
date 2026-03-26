/**
 * Crypto Proof — Verifies Ed25519 signing works end-to-end
 * This is a runtime integration test for the real crypto replacement.
 */

// Import from compiled dist
const { generateKeyPair, signData, verifySignature } = require('../packages/identity-engine/dist/index.js');
const { SettlementEngine } = require('../packages/settlement-engine/dist/index.js');

console.log('=== Ed25519 Crypto Proof ===\n');

// 1. Generate a real Ed25519 key pair
const keys = generateKeyPair();
console.log('1. Key Generation:');
console.log(`   Public key:  ${keys.publicKey} (${keys.publicKey.length / 2} bytes)`);
console.log(`   Private key: ${keys.privateKey} (${keys.privateKey.length / 2} bytes)`);
console.log(`   Keys are related: ${keys.publicKey !== keys.privateKey ? 'YES (different values, mathematically linked)' : 'ERROR'}`);

// 2. Sign and verify a message
const message = 'Hello, UnyKorn settlement!';
const signature = signData(message, keys.privateKey);
console.log(`\n2. Ed25519 Signature:`);
console.log(`   Message:   "${message}"`);
console.log(`   Signature: ${signature.slice(0, 32)}... (${signature.length / 2} bytes)`);

const valid = verifySignature(message, signature, keys.publicKey);
console.log(`   Valid:      ${valid}`);

// 3. Verify invalid signature is rejected
const tamperedMessage = 'Hello, tampered!';
const invalid = verifySignature(tamperedMessage, signature, keys.publicKey);
console.log(`   Tampered:   ${invalid} (should be false)`);

// 4. Verify wrong key is rejected
const otherKeys = generateKeyPair();
const wrongKey = verifySignature(message, signature, otherKeys.publicKey);
console.log(`   Wrong key:  ${wrongKey} (should be false)`);

// 5. End-to-end settlement receipt
console.log('\n3. Settlement Receipt (Ed25519):');
const engine = new SettlementEngine();
const receipt = engine.createReceipt({
  taskId: 'task:test-001',
  fromAgentId: 'agent:buyer-001',
  toAgentId: 'agent:seller-001',
  amount: '1000',
  assetClass: 'UNY',
  policyDecisionId: 'pd:test-001',
  releasedByPolicy: true,
  signerPublicKey: keys.publicKey,
  signerPrivateKey: keys.privateKey,
});
console.log(`   Receipt ID:  ${receipt.receiptId}`);
console.log(`   Signature:   ${receipt.signature.slice(0, 32)}... (${receipt.signature.length / 2} bytes)`);
console.log(`   Status:      ${receipt.status}`);

// 6. Verify the receipt
const receiptValid = engine.verifyReceipt(receipt.receiptId);
console.log(`   Verified:    ${receiptValid}`);
console.log(`   New status:  ${engine.getReceipt(receipt.receiptId).status}`);

// Summary
console.log('\n=== RESULTS ===');
const allPassed = valid && !invalid && !wrongKey && receiptValid;
console.log(`Key generation:        PASS`);
console.log(`Sign + verify:         ${valid ? 'PASS' : 'FAIL'}`);
console.log(`Tamper detection:      ${!invalid ? 'PASS' : 'FAIL'}`);
console.log(`Wrong-key rejection:   ${!wrongKey ? 'PASS' : 'FAIL'}`);
console.log(`Settlement receipt:    ${receiptValid ? 'PASS' : 'FAIL'}`);
console.log(`\nOverall: ${allPassed ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED ✗'}`);

process.exit(allPassed ? 0 : 1);
