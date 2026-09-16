require('./genesis402-env.js');
const llm = require('./_ops_llm.cjs');
(async () => {
  const st = await llm.status(); console.log('status:', JSON.stringify(st).slice(0, 300));
  const t = Date.now();
  const r = await llm.run({ prompt: 'In one sentence, what is HTTP 402 used for in x402?', max_tokens: 60 });
  console.log('provider=' + r.provider + ' model=' + r.model + ' ms=' + (Date.now() - t) + ' usage=' + JSON.stringify(r.usage));
  console.log('output: ' + String(r.output).slice(0, 200).replace(/\n/g, ' '));
  try { await llm.run({ prompt: 'x', model: 'gpt-4o' }); } catch (e) { console.log('refused unknown model as expected: ' + e.message); }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
