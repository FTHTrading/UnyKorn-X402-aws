'use strict';

const {
  recordGuardianApproval,
  getEscrowStatus,
  createEscrowRecord,
  markEscrowFinished,
  readEscrow,
} = require('../services/guardianApproval');
const { tryReleaseEscrow } = require('../lib/xrpl/guardianRelease');
const { getEscrow } = require('../lib/escrowStore');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/**
 * Mount on site-server: POST /api/escrow/approve, GET /api/escrow/:id/status
 * Optional: POST /api/escrow/create (dry unless execute + env flag)
 */
async function handleEscrowRoutes(req, res, urlPath) {
  const pathOnly = urlPath.split('?')[0];

  const statusMatch = pathOnly.match(/^\/api\/escrow\/([^/]+)\/status$/);
  if (req.method === 'GET' && statusMatch) {
    const escrowId = decodeURIComponent(statusMatch[1]);
    const status = getEscrowStatus(escrowId);
    if (!status || status.ok === false) {
      sendJson(res, 404, { error: 'escrow_not_found', escrowId });
      return true;
    }
    sendJson(res, 200, status);
    return true;
  }

  if (req.method === 'POST' && pathOnly === '/api/escrow/approve') {
    try {
      const body = await readBody(req);
      const { escrowId, guardianId, signature, publicKey, proofType, executeFinish } = body;
      if (!escrowId || !guardianId || !signature || !publicKey) {
        sendJson(res, 400, {
          error: 'missing_fields',
          required: ['escrowId', 'guardianId', 'signature', 'publicKey'],
        });
        return true;
      }

      const result = await recordGuardianApproval({
        escrowId,
        guardianId,
        signature,
        publicKey,
        proofType,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }

      let finish = null;
      // 2026-09-16 security finding: on-chain release must not be reachable without the operator bearer.
      const _auth = String(req.headers['authorization'] || '');
      const _ok = !!process.env.ADMIN_KEY && _auth === 'Bearer ' + process.env.ADMIN_KEY;
      if (executeFinish === true && !_ok) { json(res, 401, { ok: false, error: 'executeFinish requires the operator bearer' }); return true; }
      if (executeFinish === true && result.status?.quorumMet) {
        const jsonEscrow = getEscrow(escrowId);
        const legacy = readEscrow(escrowId);
        finish = await tryReleaseEscrow(escrowId, jsonEscrow || legacy);
        if (finish?.status === 'finished' || finish?.txHash) {
          markEscrowFinished(escrowId, finish.txHash);
        }
      }

      sendJson(res, 200, { ...result, onChainFinish: finish });
      return true;
    } catch (e) {
      sendJson(res, 500, { error: 'approve_failed', detail: e.message });
      return true;
    }
  }

  if (req.method === 'POST' && pathOnly === '/api/escrow/create') {
    try {
      const body = await readBody(req);
      const { create5ProofEscrow } = require('../lib/xrpl/escrow');
      const execute = body.execute === true && process.env.XRPL_ESCROW_EXECUTE === '1';
      const created = await create5ProofEscrow({ ...body, execute });
      if (created.escrowId && (created.status === 'created' || created.status === 'dry_run')) {
        createEscrowRecord({
          escrowId: created.escrowId,
          owner: created.owner,
          offerSequence: created.offerSequence,
          amount: body.amount || '99',
          currency: body.currency || 'USDC',
          destination: created.destination,
          txHash: created.txHash,
          status: execute ? 'awaiting_proofs' : 'dry_run',
          guardians: created.guardians,
          proofsRequired: created.guardiansRequired,
          proofTypes: created.proofTypes,
          metadata: created.metadata,
        });
      }
      sendJson(res, 200, created);
      return true;
    } catch (e) {
      sendJson(res, 500, { error: 'create_failed', detail: e.message });
      return true;
    }
  }

  return false;
}

module.exports = { handleEscrowRoutes };
