/**
 * @unykorn/receipts — Receipt Store & Type Re-exports
 *
 * In-memory receipt store with rich query capabilities.
 * Re-exports all receipt-related types from shared-types.
 */

import { nanoid } from "nanoid";

// Re-export receipt-related types
export type {
  SettlementReceipt,
  ReceiptBatch,
  ReceiptStatus,
  ProofType,
  ProofArtifact,
  MerkleNode,
  MerkleTree,
  MerkleProof,
} from "@unykorn/shared-types";

import type {
  SettlementReceipt,
  ReceiptBatch,
  ReceiptStatus,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Receipt Store
// ═══════════════════════════════════════════════════════════

export interface ReceiptQuery {
  taskId?: string;
  fromAgentId?: string;
  toAgentId?: string;
  agentId?: string; // matches either from or to
  batchId?: string;
  status?: ReceiptStatus;
  minAmount?: string;
  maxAmount?: string;
  since?: string; // ISO timestamp
  until?: string; // ISO timestamp
  limit?: number;
  offset?: number;
}

export interface ReceiptQueryResult {
  receipts: SettlementReceipt[];
  total: number;
  hasMore: boolean;
}

export class ReceiptStore {
  private receipts = new Map<string, SettlementReceipt>();
  private batches = new Map<string, ReceiptBatch>();

  // ── Receipt CRUD ─────────────────────────────────────────

  add(receipt: SettlementReceipt): void {
    this.receipts.set(receipt.receiptId, receipt);
  }

  addMany(receipts: SettlementReceipt[]): void {
    for (const r of receipts) {
      this.receipts.set(r.receiptId, r);
    }
  }

  get(receiptId: string): SettlementReceipt | undefined {
    return this.receipts.get(receiptId);
  }

  delete(receiptId: string): boolean {
    return this.receipts.delete(receiptId);
  }

  updateStatus(receiptId: string, status: ReceiptStatus): boolean {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) return false;
    receipt.status = status;
    return true;
  }

  // ── Batch CRUD ───────────────────────────────────────────

  addBatch(batch: ReceiptBatch): void {
    this.batches.set(batch.batchId, batch);
  }

  getBatch(batchId: string): ReceiptBatch | undefined {
    return this.batches.get(batchId);
  }

  getAllBatches(): ReceiptBatch[] {
    return [...this.batches.values()];
  }

  // ── Query ────────────────────────────────────────────────

  query(q: ReceiptQuery): ReceiptQueryResult {
    let results = [...this.receipts.values()];

    if (q.taskId) {
      results = results.filter((r) => r.taskId === q.taskId);
    }
    if (q.fromAgentId) {
      results = results.filter((r) => r.fromAgentId === q.fromAgentId);
    }
    if (q.toAgentId) {
      results = results.filter((r) => r.toAgentId === q.toAgentId);
    }
    if (q.agentId) {
      results = results.filter(
        (r) => r.fromAgentId === q.agentId || r.toAgentId === q.agentId,
      );
    }
    if (q.batchId) {
      results = results.filter((r) => r.batchId === q.batchId);
    }
    if (q.status) {
      results = results.filter((r) => r.status === q.status);
    }
    if (q.minAmount) {
      const min = BigInt(q.minAmount);
      results = results.filter((r) => BigInt(r.amount) >= min);
    }
    if (q.maxAmount) {
      const max = BigInt(q.maxAmount);
      results = results.filter((r) => BigInt(r.amount) <= max);
    }
    if (q.since) {
      results = results.filter((r) => r.signedAt >= q.since!);
    }
    if (q.until) {
      results = results.filter((r) => r.signedAt <= q.until!);
    }

    // Sort by signedAt descending
    results.sort((a, b) => b.signedAt.localeCompare(a.signedAt));

    const total = results.length;
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 100;
    const paged = results.slice(offset, offset + limit);

    return {
      receipts: paged,
      total,
      hasMore: offset + limit < total,
    };
  }

  // ── Aggregations ─────────────────────────────────────────

  totalSettled(): string {
    let sum = 0n;
    for (const r of this.receipts.values()) {
      if (r.status === "verified" || r.status === "anchored") {
        sum += BigInt(r.amount);
      }
    }
    return sum.toString();
  }

  countByStatus(): Record<ReceiptStatus, number> {
    const counts: Record<string, number> = {
      pending: 0,
      signed: 0,
      verified: 0,
      anchored: 0,
      disputed: 0,
    };
    for (const r of this.receipts.values()) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts as Record<ReceiptStatus, number>;
  }

  size(): number {
    return this.receipts.size;
  }
}
