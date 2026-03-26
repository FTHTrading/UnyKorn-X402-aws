/**
 * @unykorn/settlement-engine — Receipt Creation, Batching & Verification
 *
 * Creates settlement receipts, batches them with Merkle trees,
 * signs and verifies receipts using SHA-256 as a stand-in for Ed25519.
 */

import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  SettlementReceipt,
  ReceiptBatch,
  ReceiptStatus,
  MerkleNode,
  MerkleTree,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Settlement Engine
// ═══════════════════════════════════════════════════════════

export class SettlementEngine {
  private receipts = new Map<string, SettlementReceipt>();
  private batches = new Map<string, ReceiptBatch>();

  // ── Receipt Creation ─────────────────────────────────────

  createReceipt(params: {
    taskId: string;
    fromAgentId: string;
    toAgentId: string;
    amount: string;
    assetClass: SettlementReceipt["assetClass"];
    policyDecisionId: string;
    releasedByPolicy: boolean;
    artifactHash?: string;
    executionLogRef?: string;
    policyApprovalLogRef?: string;
    signerPublicKey: string;
  }): SettlementReceipt {
    const receiptId = `rcpt:${nanoid(12)}`;
    const dataToSign = this.buildSignaturePayload(receiptId, params);
    const signature = this.sign(dataToSign);

    const receipt: SettlementReceipt = {
      receiptId,
      taskId: params.taskId,
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      amount: params.amount,
      assetClass: params.assetClass,
      policyDecisionId: params.policyDecisionId,
      releasedByPolicy: params.releasedByPolicy,
      artifactHash: params.artifactHash ?? null,
      executionLogRef: params.executionLogRef ?? null,
      policyApprovalLogRef: params.policyApprovalLogRef ?? null,
      merkleProofHash: null,
      merkleIndex: null,
      batchId: null,
      status: "signed",
      signature,
      signerPublicKey: params.signerPublicKey,
      signedAt: new Date().toISOString(),
      anchorTxHash: null,
      anchoredAt: null,
    };

    this.receipts.set(receiptId, receipt);
    return receipt;
  }

  // ── Batching ─────────────────────────────────────────────

  createBatch(receiptIds: string[]): ReceiptBatch {
    const receipts = receiptIds
      .map((id) => this.receipts.get(id))
      .filter((r): r is SettlementReceipt => r !== undefined);

    if (receipts.length === 0) {
      throw new Error("No valid receipts for batch");
    }

    // Build Merkle tree from receipt hashes
    const leafHashes = receipts.map((r) => this.hashReceipt(r));
    const tree = this.buildMerkleTree(leafHashes);

    const totalValue = receipts
      .reduce((sum, r) => sum + BigInt(r.amount), 0n)
      .toString();

    const batchId = `batch:${nanoid(10)}`;
    const batch: ReceiptBatch = {
      batchId,
      merkleRoot: tree.root,
      receiptCount: receipts.length,
      receiptIds: receipts.map((r) => r.receiptId),
      totalValue,
      anchorTxHash: null,
      createdAt: new Date().toISOString(),
      anchoredAt: null,
    };

    // Update receipts with batch and Merkle info
    receipts.forEach((receipt, idx) => {
      receipt.batchId = batchId;
      receipt.merkleIndex = idx;
      receipt.merkleProofHash = leafHashes[idx];
    });

    this.batches.set(batchId, batch);
    return batch;
  }

  // ── Signing & Verification ───────────────────────────────

  /**
   * Placeholder sign using SHA-256 HMAC (stand-in for Ed25519).
   * In production this would use Ed25519 private key signing.
   */
  sign(data: string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Verify a receipt by re-computing signature from its data.
   * Returns true if the computed signature matches the stored one.
   */
  verifyReceipt(receiptId: string): boolean {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) return false;

    const dataToSign = this.buildSignaturePayload(receiptId, {
      taskId: receipt.taskId,
      fromAgentId: receipt.fromAgentId,
      toAgentId: receipt.toAgentId,
      amount: receipt.amount,
      assetClass: receipt.assetClass,
      policyDecisionId: receipt.policyDecisionId,
      releasedByPolicy: receipt.releasedByPolicy,
      artifactHash: receipt.artifactHash ?? undefined,
      executionLogRef: receipt.executionLogRef ?? undefined,
      policyApprovalLogRef: receipt.policyApprovalLogRef ?? undefined,
      signerPublicKey: receipt.signerPublicKey,
    });
    const expected = this.sign(dataToSign);
    const valid = expected === receipt.signature;

    if (valid) {
      receipt.status = "verified";
    }
    return valid;
  }

  // ── Merkle Tree ──────────────────────────────────────────

  buildMerkleTree(leaves: string[]): MerkleTree {
    if (leaves.length === 0) {
      throw new Error("Cannot build Merkle tree with no leaves");
    }

    // Pad to power of 2
    const paddedLeaves = [...leaves];
    while (paddedLeaves.length & (paddedLeaves.length - 1)) {
      paddedLeaves.push(
        createHash("sha256").update("empty").digest("hex"),
      );
    }

    const nodes: MerkleNode[] = [];
    let level = 0;

    // Leaf level
    let currentLevel = paddedLeaves.map((hash, idx): MerkleNode => {
      const node: MerkleNode = {
        hash,
        left: null,
        right: null,
        data: hash,
        index: idx,
        level,
      };
      nodes.push(node);
      return node;
    });

    // Build up
    while (currentLevel.length > 1) {
      level++;
      const nextLevel: MerkleNode[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const leftNode = currentLevel[i];
        const rightNode = currentLevel[i + 1];
        const parentHash = createHash("sha256")
          .update(leftNode.hash + rightNode.hash)
          .digest("hex");
        const parent: MerkleNode = {
          hash: parentHash,
          left: leftNode.hash,
          right: rightNode.hash,
          data: null,
          index: Math.floor(i / 2),
          level,
        };
        nodes.push(parent);
        nextLevel.push(parent);
      }
      currentLevel = nextLevel;
    }

    const depth = level;
    return {
      root: currentLevel[0].hash,
      leaves: paddedLeaves,
      nodes,
      depth,
      leafCount: leaves.length,
    };
  }

  // ── Queries ──────────────────────────────────────────────

  getReceipt(id: string): SettlementReceipt | undefined {
    return this.receipts.get(id);
  }

  getReceiptsByTask(taskId: string): SettlementReceipt[] {
    return [...this.receipts.values()].filter((r) => r.taskId === taskId);
  }

  getReceiptsByAgent(agentId: string): SettlementReceipt[] {
    return [...this.receipts.values()].filter(
      (r) => r.fromAgentId === agentId || r.toAgentId === agentId,
    );
  }

  getReceiptsByBatch(batchId: string): SettlementReceipt[] {
    return [...this.receipts.values()].filter((r) => r.batchId === batchId);
  }

  getBatch(id: string): ReceiptBatch | undefined {
    return this.batches.get(id);
  }

  getAllBatches(): ReceiptBatch[] {
    return [...this.batches.values()];
  }

  // ── Private Helpers ──────────────────────────────────────

  private hashReceipt(receipt: SettlementReceipt): string {
    const data = `${receipt.receiptId}:${receipt.taskId}:${receipt.fromAgentId}:${receipt.toAgentId}:${receipt.amount}`;
    return createHash("sha256").update(data).digest("hex");
  }

  private buildSignaturePayload(
    receiptId: string,
    params: {
      taskId: string;
      fromAgentId: string;
      toAgentId: string;
      amount: string;
      assetClass: string;
      policyDecisionId: string;
      releasedByPolicy: boolean;
      artifactHash?: string;
      executionLogRef?: string;
      policyApprovalLogRef?: string;
      signerPublicKey: string;
    },
  ): string {
    return [
      receiptId,
      params.taskId,
      params.fromAgentId,
      params.toAgentId,
      params.amount,
      params.assetClass,
      params.policyDecisionId,
      String(params.releasedByPolicy),
      params.artifactHash ?? "",
      params.executionLogRef ?? "",
      params.policyApprovalLogRef ?? "",
      params.signerPublicKey,
    ].join(":");
  }
}
