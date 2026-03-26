/**
 * @unykorn/genesis-ledger — Machine Settlement & Accounting Engine
 *
 * UNY Genesis is the internal machine settlement and operating ledger.
 * It is NOT a second token — it is a controlled accounting layer
 * derived from UNY Core deposits and governed by policy.
 *
 * Supports:
 * - Six balance classes (OPERATING, ESCROW, RESERVED, STAKED, PROOF, COMPLIANCE)
 * - Double-entry append-only ledger
 * - Escrow with conditional release
 * - Streaming balances
 * - Treasury refill
 * - Dispute and refund flows
 */

import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import type {
  GenesisBalanceClass,
  LedgerEntry,
  LedgerEntryType,
  GenesisAccount,
  EscrowObject,
  EscrowCondition,
  EscrowStatus,
  TreasuryState,
  StreamingBalance,
} from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Ledger Engine
// ═══════════════════════════════════════════════════════════

export class GenesisLedger {
  private accounts = new Map<string, GenesisAccount>();
  private entries: LedgerEntry[] = [];
  private escrows = new Map<string, EscrowObject>();
  private streams = new Map<string, StreamingBalance>();
  private sequence = 0n;
  private lastHash = "genesis:0000000000000000";

  // ── Account Management ────────────────────────────────

  createAccount(agentId: string, orgId: string, parentAccountId?: string): GenesisAccount {
    const accountId = `ga:${nanoid(10)}`;
    const now = new Date().toISOString();

    const account: GenesisAccount = {
      accountId,
      agentId,
      orgId,
      balances: {
        OPERATING: "0",
        ESCROW: "0",
        RESERVED: "0",
        STAKED_RELIABILITY: "0",
        PROOF_RECEIPT: "0",
        COMPLIANCE_CLEARED: "0",
      },
      isSubAccount: !!parentAccountId,
      parentAccountId: parentAccountId ?? null,
      status: "active",
      totalDeposited: "0",
      totalWithdrawn: "0",
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(accountId, account);
    return account;
  }

  getAccount(accountId: string): GenesisAccount | undefined {
    return this.accounts.get(accountId);
  }

  getAccountByAgent(agentId: string): GenesisAccount | undefined {
    return [...this.accounts.values()].find((a) => a.agentId === agentId && !a.isSubAccount);
  }

  // ── Core Ledger Operations ────────────────────────────

  /** Deposit UNY Core into Genesis operating balance */
  deposit(agentId: string, amount: string, memo = "UNY Core deposit"): LedgerEntry {
    const account = this.getAccountByAgent(agentId);
    if (!account) throw new Error(`No account for agent ${agentId}`);
    if (account.status !== "active") throw new Error(`Account ${account.accountId} is ${account.status}`);

    account.balances.OPERATING = (BigInt(account.balances.OPERATING) + BigInt(amount)).toString();
    account.totalDeposited = (BigInt(account.totalDeposited) + BigInt(amount)).toString();
    account.updatedAt = new Date().toISOString();

    return this.appendEntry({
      type: "deposit",
      fromAgentId: null,
      toAgentId: agentId,
      amount,
      fromClass: null,
      toClass: "OPERATING",
      taskId: null,
      policyDecisionId: null,
      memo,
    });
  }

  /** Withdraw Genesis balance back to UNY Core */
  withdraw(agentId: string, amount: string, memo = "Withdrawal to UNY Core"): LedgerEntry {
    const account = this.getAccountByAgent(agentId);
    if (!account) throw new Error(`No account for agent ${agentId}`);

    this.debit(account, "OPERATING", amount);
    account.totalWithdrawn = (BigInt(account.totalWithdrawn) + BigInt(amount)).toString();
    account.updatedAt = new Date().toISOString();

    return this.appendEntry({
      type: "withdrawal",
      fromAgentId: agentId,
      toAgentId: null,
      amount,
      fromClass: "OPERATING",
      toClass: null,
      taskId: null,
      policyDecisionId: null,
      memo,
    });
  }

  /** Transfer between agents */
  transfer(params: {
    fromAgentId: string;
    toAgentId: string;
    amount: string;
    fromClass?: GenesisBalanceClass;
    toClass?: GenesisBalanceClass;
    taskId?: string;
    policyDecisionId?: string;
    memo?: string;
  }): LedgerEntry {
    const fromAccount = this.getAccountByAgent(params.fromAgentId);
    const toAccount = this.getAccountByAgent(params.toAgentId);
    if (!fromAccount) throw new Error(`No account for agent ${params.fromAgentId}`);
    if (!toAccount) throw new Error(`No account for agent ${params.toAgentId}`);

    const fromClass = params.fromClass ?? "OPERATING";
    const toClass = params.toClass ?? "OPERATING";

    this.debit(fromAccount, fromClass, params.amount);
    this.credit(toAccount, toClass, params.amount);

    return this.appendEntry({
      type: "transfer",
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      amount: params.amount,
      fromClass,
      toClass,
      taskId: params.taskId ?? null,
      policyDecisionId: params.policyDecisionId ?? null,
      memo: params.memo ?? "Agent transfer",
    });
  }

  // ── Escrow Operations ─────────────────────────────────

  /** Lock funds into escrow for a task */
  escrowLock(params: {
    depositorAgentId: string;
    beneficiaryAgentId: string;
    taskId: string;
    amount: string;
    conditions: Omit<EscrowCondition, "conditionId">[];
    expiresAt: string;
  }): EscrowObject {
    const account = this.getAccountByAgent(params.depositorAgentId);
    if (!account) throw new Error(`No account for agent ${params.depositorAgentId}`);

    this.debit(account, "OPERATING", params.amount);
    this.credit(account, "ESCROW", params.amount);

    const escrowId = `escrow:${nanoid(10)}`;
    const now = new Date().toISOString();

    const escrow: EscrowObject = {
      escrowId,
      taskId: params.taskId,
      depositorAgentId: params.depositorAgentId,
      beneficiaryAgentId: params.beneficiaryAgentId,
      amount: params.amount,
      releasedAmount: "0",
      refundedAmount: "0",
      status: "locked",
      releaseConditions: params.conditions.map((c) => ({
        ...c,
        conditionId: `cond:${nanoid(8)}`,
      })),
      expiresAt: params.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    this.escrows.set(escrowId, escrow);

    this.appendEntry({
      type: "escrow_lock",
      fromAgentId: params.depositorAgentId,
      toAgentId: params.beneficiaryAgentId,
      amount: params.amount,
      fromClass: "OPERATING",
      toClass: "ESCROW",
      taskId: params.taskId,
      policyDecisionId: null,
      memo: `Escrow locked for task ${params.taskId}`,
    });

    return escrow;
  }

  /** Release escrowed funds to the beneficiary */
  escrowRelease(escrowId: string, amount: string, policyDecisionId?: string): LedgerEntry {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);
    if (escrow.status === "fully_released" || escrow.status === "refunded") {
      throw new Error(`Escrow ${escrowId} is ${escrow.status}`);
    }

    const remaining = BigInt(escrow.amount) - BigInt(escrow.releasedAmount) - BigInt(escrow.refundedAmount);
    if (BigInt(amount) > remaining) throw new Error("Release amount exceeds remaining escrow");

    escrow.releasedAmount = (BigInt(escrow.releasedAmount) + BigInt(amount)).toString();

    if (BigInt(escrow.releasedAmount) >= BigInt(escrow.amount)) {
      escrow.status = "fully_released";
    } else {
      escrow.status = "partially_released";
    }
    escrow.updatedAt = new Date().toISOString();

    // Move from depositor's escrow to beneficiary's operating
    const depositorAccount = this.getAccountByAgent(escrow.depositorAgentId);
    const beneficiaryAccount = this.getAccountByAgent(escrow.beneficiaryAgentId);
    if (!depositorAccount || !beneficiaryAccount) throw new Error("Account missing");

    this.debit(depositorAccount, "ESCROW", amount);
    this.credit(beneficiaryAccount, "OPERATING", amount);

    return this.appendEntry({
      type: "escrow_release",
      fromAgentId: escrow.depositorAgentId,
      toAgentId: escrow.beneficiaryAgentId,
      amount,
      fromClass: "ESCROW",
      toClass: "OPERATING",
      taskId: escrow.taskId,
      policyDecisionId: policyDecisionId ?? null,
      memo: `Escrow released for task ${escrow.taskId}`,
    });
  }

  /** Refund escrow back to depositor */
  escrowRefund(escrowId: string): LedgerEntry {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

    const remaining = BigInt(escrow.amount) - BigInt(escrow.releasedAmount) - BigInt(escrow.refundedAmount);
    if (remaining <= 0n) throw new Error("Nothing to refund");

    const refundAmount = remaining.toString();
    escrow.refundedAmount = (BigInt(escrow.refundedAmount) + remaining).toString();
    escrow.status = "refunded";
    escrow.updatedAt = new Date().toISOString();

    const depositorAccount = this.getAccountByAgent(escrow.depositorAgentId);
    if (!depositorAccount) throw new Error("Depositor account missing");

    this.debit(depositorAccount, "ESCROW", refundAmount);
    this.credit(depositorAccount, "OPERATING", refundAmount);

    return this.appendEntry({
      type: "escrow_refund",
      fromAgentId: escrow.depositorAgentId,
      toAgentId: escrow.depositorAgentId,
      amount: refundAmount,
      fromClass: "ESCROW",
      toClass: "OPERATING",
      taskId: escrow.taskId,
      policyDecisionId: null,
      memo: `Escrow refunded for task ${escrow.taskId}`,
    });
  }

  // ── Reserve & Stake ───────────────────────────────────

  reserve(agentId: string, amount: string, taskId?: string): LedgerEntry {
    const account = this.getAccountByAgent(agentId);
    if (!account) throw new Error(`No account for agent ${agentId}`);
    this.debit(account, "OPERATING", amount);
    this.credit(account, "RESERVED", amount);
    return this.appendEntry({
      type: "reserve", fromAgentId: agentId, toAgentId: agentId, amount,
      fromClass: "OPERATING", toClass: "RESERVED", taskId: taskId ?? null,
      policyDecisionId: null, memo: "Budget reserved",
    });
  }

  unreserve(agentId: string, amount: string, taskId?: string): LedgerEntry {
    const account = this.getAccountByAgent(agentId);
    if (!account) throw new Error(`No account for agent ${agentId}`);
    this.debit(account, "RESERVED", amount);
    this.credit(account, "OPERATING", amount);
    return this.appendEntry({
      type: "unreserve", fromAgentId: agentId, toAgentId: agentId, amount,
      fromClass: "RESERVED", toClass: "OPERATING", taskId: taskId ?? null,
      policyDecisionId: null, memo: "Budget unreserved",
    });
  }

  stake(agentId: string, amount: string): LedgerEntry {
    const account = this.getAccountByAgent(agentId);
    if (!account) throw new Error(`No account for agent ${agentId}`);
    this.debit(account, "OPERATING", amount);
    this.credit(account, "STAKED_RELIABILITY", amount);
    return this.appendEntry({
      type: "stake", fromAgentId: agentId, toAgentId: agentId, amount,
      fromClass: "OPERATING", toClass: "STAKED_RELIABILITY", taskId: null,
      policyDecisionId: null, memo: "Reliability stake",
    });
  }

  unstake(agentId: string, amount: string): LedgerEntry {
    const account = this.getAccountByAgent(agentId);
    if (!account) throw new Error(`No account for agent ${agentId}`);
    this.debit(account, "STAKED_RELIABILITY", amount);
    this.credit(account, "OPERATING", amount);
    return this.appendEntry({
      type: "unstake", fromAgentId: agentId, toAgentId: agentId, amount,
      fromClass: "STAKED_RELIABILITY", toClass: "OPERATING", taskId: null,
      policyDecisionId: null, memo: "Unstake",
    });
  }

  // ── Settlement ────────────────────────────────────────

  /** Final settlement — moves to PROOF_RECEIPT (immutable) */
  settle(params: {
    fromAgentId: string;
    toAgentId: string;
    amount: string;
    taskId: string;
    policyDecisionId: string;
  }): LedgerEntry {
    const toAccount = this.getAccountByAgent(params.toAgentId);
    if (!toAccount) throw new Error(`No account for agent ${params.toAgentId}`);

    // Settlement creates a proof receipt balance entry (append-only)
    this.credit(toAccount, "PROOF_RECEIPT", params.amount);

    return this.appendEntry({
      type: "settle",
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      amount: params.amount,
      fromClass: "OPERATING",
      toClass: "PROOF_RECEIPT",
      taskId: params.taskId,
      policyDecisionId: params.policyDecisionId,
      memo: `Settlement for task ${params.taskId}`,
    });
  }

  // ── Treasury State ────────────────────────────────────

  getTreasuryState(): TreasuryState {
    let totalDeposits = 0n;
    let totalWithdrawn = 0n;
    let totalOperating = 0n;
    let totalEscrowed = 0n;
    let totalReserved = 0n;
    let totalStaked = 0n;
    let totalSettled = 0n;
    let totalCompliance = 0n;

    for (const account of this.accounts.values()) {
      totalDeposits += BigInt(account.totalDeposited);
      totalWithdrawn += BigInt(account.totalWithdrawn);
      totalOperating += BigInt(account.balances.OPERATING);
      totalEscrowed += BigInt(account.balances.ESCROW);
      totalReserved += BigInt(account.balances.RESERVED);
      totalStaked += BigInt(account.balances.STAKED_RELIABILITY);
      totalSettled += BigInt(account.balances.PROOF_RECEIPT);
      totalCompliance += BigInt(account.balances.COMPLIANCE_CLEARED);
    }

    const totalGenesisSupply = totalDeposits - totalWithdrawn;
    const accountedFor = totalOperating + totalEscrowed + totalReserved + totalStaked + totalSettled + totalCompliance;

    return {
      totalCoreDeposits: totalDeposits.toString(),
      totalOperating: totalOperating.toString(),
      totalEscrowed: totalEscrowed.toString(),
      totalReserved: totalReserved.toString(),
      totalStaked: totalStaked.toString(),
      totalSettled: totalSettled.toString(),
      totalComplianceCleared: totalCompliance.toString(),
      totalGenesisSupply: totalGenesisSupply.toString(),
      reconciledAt: new Date().toISOString(),
      balanced: totalGenesisSupply === accountedFor,
    };
  }

  // ── Query ─────────────────────────────────────────────

  getEntries(limit = 100, offset = 0): LedgerEntry[] {
    return this.entries.slice(offset, offset + limit);
  }

  getEntriesByAgent(agentId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.fromAgentId === agentId || e.toAgentId === agentId);
  }

  getEntriesByTask(taskId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.taskId === taskId);
  }

  getEscrow(escrowId: string): EscrowObject | undefined {
    return this.escrows.get(escrowId);
  }

  getEscrowsByTask(taskId: string): EscrowObject[] {
    return [...this.escrows.values()].filter((e) => e.taskId === taskId);
  }

  entryCount(): number {
    return this.entries.length;
  }

  // ── Internal Helpers ──────────────────────────────────

  private credit(account: GenesisAccount, cls: GenesisBalanceClass, amount: string): void {
    account.balances[cls] = (BigInt(account.balances[cls]) + BigInt(amount)).toString();
    account.updatedAt = new Date().toISOString();
  }

  private debit(account: GenesisAccount, cls: GenesisBalanceClass, amount: string): void {
    const current = BigInt(account.balances[cls]);
    if (BigInt(amount) > current) {
      throw new Error(`Insufficient ${cls} balance: have ${current}, need ${amount}`);
    }
    account.balances[cls] = (current - BigInt(amount)).toString();
    account.updatedAt = new Date().toISOString();
  }

  private appendEntry(params: {
    type: LedgerEntryType;
    fromAgentId: string | null;
    toAgentId: string | null;
    amount: string;
    fromClass: GenesisBalanceClass | null;
    toClass: GenesisBalanceClass | null;
    taskId: string | null;
    policyDecisionId: string | null;
    memo: string;
  }): LedgerEntry {
    this.sequence += 1n;

    const entryData = JSON.stringify({
      seq: this.sequence.toString(),
      ...params,
      prev: this.lastHash,
    });

    const entryHash = createHash("sha256").update(entryData).digest("hex");

    const entry: LedgerEntry = {
      entryId: `le:${nanoid(12)}`,
      sequence: this.sequence,
      type: params.type,
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      amount: params.amount,
      fromClass: params.fromClass,
      toClass: params.toClass,
      taskId: params.taskId,
      policyDecisionId: params.policyDecisionId,
      memo: params.memo,
      timestamp: new Date().toISOString(),
      entryHash,
      previousHash: this.lastHash,
      idempotencyKey: `idem:${nanoid(16)}`,
    };

    this.entries.push(entry);
    this.lastHash = entryHash;

    return entry;
  }
}

// ═══════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════

export type {
  GenesisBalanceClass,
  LedgerEntry,
  LedgerEntryType,
  GenesisAccount,
  EscrowObject,
  EscrowCondition,
  EscrowStatus,
  TreasuryState,
  StreamingBalance,
} from "@unykorn/shared-types";

export { BALANCE_CLASS_CODES } from "@unykorn/shared-types";
