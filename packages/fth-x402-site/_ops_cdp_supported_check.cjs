// Ops check: what the CDP facilitator will settle for us, and lane selection sanity. Prints no secrets.
require('./genesis402-env.js');
const rails = require('./_ops_rails.cjs');
const lanes = require('./_ops_lanes.cjs');
(async () => {
  const s = await lanes.cdpSupported(rails.cdpCall);
  console.log('CDP supported ok=' + s.ok + ' status=' + s.status + ' kinds=' + s.raw_count);
  console.log('networks: ' + s.networks.join(', '));
  console.log('solana feePayer: ' + (s.solanaFeePayer || 'none'));
  console.log('selectLane: ' + ['eip155:137','solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp','stellar:pubnet','xrpl:mainnet','eip155:8453','','eip155:1'].map((n) => JSON.stringify(n) + '=>' + lanes.selectLane({ network: n })).join(' | '));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
