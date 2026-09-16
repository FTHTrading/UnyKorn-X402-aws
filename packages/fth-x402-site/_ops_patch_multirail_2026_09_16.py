# Wires _ops_lanes.cjs into the rail: polygon:usdc + solana:usdc (CDP exact) and stellar:usdc (pay-first) become
# real lanes in readiness, accepts, settlement and the task server's payment path. Idempotent (marker: _ops_lanes).
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))

def patch(name, edits, marker):
    p = os.path.join(HERE, name)
    s = io.open(p, encoding='utf-8').read()
    if marker in s:
        print(name, 'already patched'); return
    for old, new, label in edits:
        assert s.count(old) == 1, name + ' anchor: ' + label + ' (count=%d)' % s.count(old)
        s = s.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print(name, 'patched')

patch('_ops_rails.cjs', [
    ("const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';",
     "const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';\nconst lanes = require('./_ops_lanes.cjs');", 'require'),
    # readiness: add CDP-settled polygon/solana lanes + stellar payTo, after the existing lane table
    ("""      'stellar:usdc': stellarR.ok
        ? { payable: true, payTo: stellarR.account }
        : { payable: false, reason: stellarR.reason }
    },
    cdp, relayer: relayerR
  };""", """      'stellar:usdc': stellarR.ok
        ? { payable: true, payTo: stellarR.account, price_usd: Number(lanes.STELLAR_PRICE), usdc_issuer: lanes.STELLAR_USDC_ISSUER, pay_first: true }
        : { payable: false, reason: stellarR.reason },
      'polygon:usdc': lanes.exactLaneStatus('polygon:usdc', cdp.ok, supported),
      'solana:usdc': lanes.exactLaneStatus('solana:usdc', cdp.ok, supported)
    },
    cdp, relayer: relayerR,
    cdp_supported_networks: supported ? supported.networks : []
  };""", 'readiness lanes'),
    ("""  // Base is payable only if we can RECEIVE (always true for an EOA) AND SETTLE.""",
     """  // Which networks the facilitator will actually settle; polygon and solana are quoted only when listed here.
  const supported = cdp.ok ? await lanes.cdpSupported(cdpCall) : null;
  // Base is payable only if we can RECEIVE (always true for an EOA) AND SETTLE.""", 'supported'),
    # accepts: polygon, solana, stellar
    ("""  if (r.lanes['xrpl:rlusd'].payable) {
    out.push({ scheme: 'exact', network: 'xrpl:mainnet', asset: 'RLUSD', price: PRICES.xrpl_xrp, payTo: payToXrpl(), issuer: RLUSD_ISSUER });
  }
  return out;""", """  if (r.lanes['xrpl:rlusd'].payable) {
    out.push({ scheme: 'exact', network: 'xrpl:mainnet', asset: 'RLUSD', price: PRICES.xrpl_xrp, payTo: payToXrpl(), issuer: RLUSD_ISSUER });
  }
  for (const k of ['polygon:usdc', 'solana:usdc']) {
    if (r.lanes[k] && r.lanes[k].payable) {
      const q = lanes.exactRequirements(k, r.lanes[k]); delete q.resource;
      out.push(q);
    }
  }
  if (r.lanes['stellar:usdc'] && r.lanes['stellar:usdc'].payable) out.push(lanes.stellarAccept(r.lanes['stellar:usdc']));
  return out;""", 'accepts'),
    # settleExact dispatcher + exports
    ("""module.exports = {
  PRICES, BASE_USDC, RLUSD_ISSUER, readiness, buildAccepts,
  verifyXrpl, settleBase, settleBaseSelf, cdpStatus, relayerStatus,
  xrplStatus, stellarStatus, decodePaymentHeader, payToEvm, payToXrpl
};""", """/** Settle any CDP-settled lane. base keeps its self-settle fallback; polygon/solana are CDP-only. */
async function settleExact(payment, laneKey, ctx) {
  if (laneKey === 'base:usdc') return settleBase(payment, ctx);
  const r = await readiness();
  const st = r.lanes[laneKey];
  if (!st || !st.payable) return { ok: false, reason: 'lane_unavailable', lane: laneKey, detail: st && st.reason };
  return lanes.settleExactCdp(cdpCall, laneKey, st, payment, ctx);
}

module.exports = {
  PRICES, BASE_USDC, RLUSD_ISSUER, readiness, buildAccepts,
  verifyXrpl, settleBase, settleBaseSelf, settleExact, cdpStatus, relayerStatus,
  xrplStatus, stellarStatus, decodePaymentHeader, payToEvm, payToXrpl,
  selectLane: lanes.selectLane, verifyStellar: lanes.verifyStellar, EXACT_LANES: lanes.EXACT_LANES, cdpCall
};""", 'exports'),
], '_ops_lanes')

patch('task-server.js', [
    ("""  const r = await rails.readiness();
  const isXrpl = String(payment.network || '').includes('xrpl');
  const laneKey = isXrpl ? (payment.asset === 'RLUSD' ? 'xrpl:rlusd' : 'xrpl:xrp') : 'base:usdc';
  if (!r.lanes[laneKey] || !r.lanes[laneKey].payable) {""", """  const r = await rails.readiness();
  const laneKey = rails.selectLane(payment);
  if (!laneKey) return send(res, 400, { error: 'unknown_network', message: 'X-PAYMENT names a network this rail does not run. Lanes: ' + Object.keys(r.lanes).join(', ') });
  const isXrpl = laneKey.startsWith('xrpl:');
  const isStellar = laneKey === 'stellar:usdc';
  if (!r.lanes[laneKey] || !r.lanes[laneKey].payable) {""", 'lane select'),
    ("""    proof = { rail: v.rail, txHash: v.txHash, amount_usd: v.amount_usd, paid: v.paid, settled_by: 'payer (pay-first rail)' };
  } else {
    const s = await rails.settleBase(payment, { resourceUrl: PUBLIC_ORIGIN + CATALOG[taskName].path, extensions: bazaarExtension(taskName) });
    if (!s.ok) {
      alerts.alert('warn', 'x402 Base settlement FAILED', { Reason: s.reason, Detail: s.detail || s.self || '', Task: taskName }, 'basefail:' + s.reason);
      return send(res, 402, {
        error: 'settlement_failed', reason: s.reason, detail: s.detail || s.self,
        message: 'Your authorization was not settled, so no funds moved from your wallet and nothing was delivered.'
      });
    }
    proof = { rail: 'base:usdc', txHash: s.txHash, amount_usd: s.amount_usd, paid: '$' + s.amount_usd + ' USDC', settled_by: s.via };
  }""", """    proof = { rail: v.rail, txHash: v.txHash, amount_usd: v.amount_usd, paid: v.paid, settled_by: 'payer (pay-first rail)' };
  } else if (isStellar) {
    const v = await rails.verifyStellar(payment);
    if (!v.valid) {
      alerts.alert('warn', 'x402 payment REJECTED', { Lane: laneKey, Reason: v.reason, Task: taskName, Detail: v.detail }, 'reject:' + v.reason);
      return send(res, v.retryable ? 503 : 402, {
        error: 'payment_not_verified', reason: v.reason, detail: v.detail,
        required: { asset: 'USDC', issuer: r.lanes[laneKey].usdc_issuer, amount: r.lanes[laneKey].price_usd, payTo: r.lanes[laneKey].payTo },
        message: v.retryable
          ? 'Our verifier could not reach Horizon right now. We fail closed rather than guess. Your payment is on-chain and can be re-presented once this clears.'
          : 'That proof did not verify as a settled USDC payment of the required amount to our Stellar address.'
      });
    }
    proof = { rail: v.rail, txHash: v.txHash, amount_usd: v.amount_usd, paid: v.paid, settled_by: 'payer (pay-first rail)' };
  } else {
    const s = await rails.settleExact(payment, laneKey, { resourceUrl: PUBLIC_ORIGIN + CATALOG[taskName].path, extensions: bazaarExtension(taskName) });
    if (!s.ok) {
      alerts.alert('warn', 'x402 ' + laneKey + ' settlement FAILED', { Reason: s.reason, Detail: s.detail || s.self || '', Task: taskName }, 'settlefail:' + laneKey + ':' + s.reason);
      return send(res, 402, {
        error: 'settlement_failed', lane: laneKey, reason: s.reason, detail: s.detail || s.self,
        message: 'Your authorization was not settled, so no funds moved from your wallet and nothing was delivered.'
      });
    }
    proof = { rail: laneKey, txHash: s.txHash, amount_usd: s.amount_usd, paid: '$' + s.amount_usd + ' USDC', settled_by: s.via };
  }""", 'settle branch'),
    ("""    const owed = proof.rail === 'base:usdc';""", """    const owed = !isXrpl && !isStellar; // facilitator-settled lanes: the buyer's money moved before delivery""", 'owed'),
    ("""        price: { usd: rails.PRICES.base_usdc_usd, note: 'per successful execution; XRPL lane is ' + rails.PRICES.xrpl_xrp + ' XRP' }""",
     """        price: { usd: rails.PRICES.base_usdc_usd, note: 'per successful execution on base, polygon, solana or stellar (USDC); XRPL lane is ' + rails.PRICES.xrpl_xrp + ' XRP' }""", 'price note'),
], 'selectLane')
