/**
 * Stellar bridge credit service.
 * Handles minting / burning x402 USDF credits backed by the Stellar USDF treasury.
 */
import { Horizon, Asset, Keypair, TransactionBuilder, Networks, Operation, Memo } from "@stellar/stellar-sdk";
import pool from "../db";

const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org";
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK === "testnet"
  ? Networks.TESTNET
  : Networks.PUBLIC;

const TREASURY_PUBLIC  = process.env.STELLAR_TREASURY_PUBLIC  ?? "";
const TREASURY_SECRET  = process.env.STELLAR_TREASURY_SECRET  ?? "";
const USDF_ISSUER      = process.env.STELLAR_USDF_ISSUER       ?? "";
const USDF_ASSET       = new Asset("USDF", USDF_ISSUER);

const server = new Horizon.Server(HORIZON_URL);

/** Ensure a credit_account exists for wallet_address, return its id. */
async function upsertCreditAccount(walletAddress: string, namespace?: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM credit_accounts WHERE wallet_address = $1 FOR UPDATE",
      [walletAddress]
    );
    if (existing.rows.length > 0) {
      if (namespace) {
        await client.query(
          "UPDATE credit_accounts SET namespace = $1, updated_at = now() WHERE id = $2",
          [namespace, existing.rows[0].id]
        );
      }
      await client.query("COMMIT");
      return existing.rows[0].id;
    }
    const ins = await client.query<{ id: string }>(
      `INSERT INTO credit_accounts (wallet_address, rail, namespace, balance_usdf)
       VALUES ($1, 'stellar-usdf', $2, 0) RETURNING id`,
      [walletAddress, namespace ?? null]
    );
    await client.query("COMMIT");
    return ins.rows[0].id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Credit USDF to a credit account.  Returns the credit_transaction id. */
async function creditAccount(
  accountId: string,
  usdfAmount: number,
  reference: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const acc = await client.query<{ id: string; balance_usdf: string; frozen: boolean }>(
      "SELECT id, balance_usdf, frozen FROM credit_accounts WHERE id = $1 FOR UPDATE",
      [accountId]
    );
    if (!acc.rows.length) throw new Error(`Credit account ${accountId} not found`);
    if (acc.rows[0].frozen) throw new Error(`Credit account ${accountId} is frozen`);

    const balanceBefore = Number(acc.rows[0].balance_usdf);
    const balanceAfter  = balanceBefore + usdfAmount;

    await client.query(
      "UPDATE credit_accounts SET balance_usdf = $1, updated_at = now() WHERE id = $2",
      [balanceAfter.toFixed(7), accountId]
    );

    const tx = await client.query<{ id: string }>(
      `INSERT INTO credit_transactions (account_id, type, amount, balance_after, reference, rail, metadata)
       VALUES ($1, 'deposit', $2, $3, $4, 'stellar-usdf', $5) RETURNING id`,
      [accountId, usdfAmount.toFixed(7), balanceAfter.toFixed(7), reference, JSON.stringify(metadata ?? {})]
    );

    await client.query("COMMIT");
    return tx.rows[0].id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Debit USDF from a credit account. Returns credit_transaction id. */
async function debitAccount(
  walletAddress: string,
  usdfAmount: number,
  reference: string
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const acc = await client.query<{ id: string; balance_usdf: string; frozen: boolean }>(
      "SELECT id, balance_usdf, frozen FROM credit_accounts WHERE wallet_address = $1 FOR UPDATE",
      [walletAddress]
    );
    if (!acc.rows.length) throw new Error(`Credit account for ${walletAddress} not found`);
    if (acc.rows[0].frozen) throw new Error(`Credit account is frozen`);

    const balance = Number(acc.rows[0].balance_usdf);
    if (balance < usdfAmount) throw new Error(`Insufficient balance: have ${balance}, need ${usdfAmount}`);

    const balanceAfter = balance - usdfAmount;
    await client.query(
      "UPDATE credit_accounts SET balance_usdf = $1, updated_at = now() WHERE id = $2",
      [balanceAfter.toFixed(7), acc.rows[0].id]
    );

    const tx = await client.query<{ id: string }>(
      `INSERT INTO credit_transactions (account_id, type, amount, balance_after, reference, rail)
       VALUES ($1, 'withdrawal', $2, $3, $4, 'stellar-usdf') RETURNING id`,
      [acc.rows[0].id, usdfAmount.toFixed(7), balanceAfter.toFixed(7), reference]
    );

    await client.query("COMMIT");
    return tx.rows[0].id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Get current USDF balance of the Stellar treasury account. */
export async function getTreasuryBalance(): Promise<number> {
  const acct = await server.loadAccount(TREASURY_PUBLIC);
  for (const bal of acct.balances) {
    if (bal.asset_type !== "credit_alphanum4" && bal.asset_type !== "credit_alphanum12") continue;
    const b = bal as Horizon.HorizonApi.BalanceLineAsset;
    if (b.asset_code === "USDF" && b.asset_issuer === USDF_ISSUER) {
      return Number(b.balance);
    }
  }
  return 0;
}

/**
 * Admin seed: allocate USDF credits backed by treasury reserve.
 * Does NOT move on-chain Stellar funds — the treasury backs the credit.
 */
export async function seedCredits(
  walletAddress: string,
  usdfAmount: number,
  namespace?: string,
  reference?: string
): Promise<{ deposit_id: string; credit_tx_id: string; balance_after: number }> {
  const synthHash = `seed:${walletAddress}:${usdfAmount}:${Date.now()}`;
  const accountId = await upsertCreditAccount(walletAddress, namespace);
  const creditTxId = await creditAccount(accountId, usdfAmount, reference ?? synthHash, {
    source: "treasury_reserve",
    seeded_at: new Date().toISOString(),
  });

  const dep = await pool.query<{ id: string }>(
    `INSERT INTO stellar_bridge_deposits
       (stellar_tx_hash, stellar_payer, usdf_amount, target_wallet, target_namespace,
        credit_tx_id, deposit_source, status, settled_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'treasury_reserve', 'settled', now())
     RETURNING id`,
    [synthHash, TREASURY_PUBLIC, usdfAmount.toFixed(7), walletAddress, namespace ?? null, creditTxId]
  );

  const bal = await pool.query<{ balance_usdf: string }>(
    "SELECT balance_usdf FROM credit_accounts WHERE id = $1",
    [accountId]
  );

  return {
    deposit_id: dep.rows[0].id,
    credit_tx_id: creditTxId,
    balance_after: Number(bal.rows[0].balance_usdf),
  };
}

/**
 * Process a real Stellar payment: verify on-chain, then credit x402 account.
 * The memo text should equal the target x402 wallet address.
 */
export async function processStellarDeposit(
  stellarTxHash: string,
  targetWallet: string,
  targetNamespace?: string
): Promise<{ deposit_id: string; usdf_amount: number; credit_tx_id: string }> {
  // Guard: don't double-process
  const dup = await pool.query(
    "SELECT id, status FROM stellar_bridge_deposits WHERE stellar_tx_hash = $1",
    [stellarTxHash]
  );
  if (dup.rows.length > 0 && dup.rows[0].status === "settled") {
    throw new Error("Deposit already processed");
  }

  // Fetch tx from Stellar Horizon
  const txRecord = await server.transactions().transaction(stellarTxHash).call();
  const ops = await server.operations().forTransaction(stellarTxHash).call();

  let usdfAmount = 0;
  let stellarPayer = txRecord.source_account;
  const ledgerSeq = txRecord.ledger_attr ?? 0;

  for (const op of ops.records) {
    if (op.type !== "payment") continue;
    const p = op as Horizon.HorizonApi.PaymentOperationResponse;
    if (p.asset_code === "USDF" && p.asset_issuer === USDF_ISSUER && p.to === TREASURY_PUBLIC) {
      usdfAmount += Number(p.amount);
      stellarPayer = p.from;
    }
  }

  if (usdfAmount === 0) throw new Error("No USDF payment to treasury found in transaction");

  // Upsert deposit record as processing
  let depositId: string;
  if (dup.rows.length > 0) {
    depositId = dup.rows[0].id;
    await pool.query(
      "UPDATE stellar_bridge_deposits SET status = 'processing', updated_at = now() WHERE id = $1",
      [depositId]
    );
  } else {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO stellar_bridge_deposits
         (stellar_tx_hash, stellar_payer, stellar_ledger_seq, usdf_amount, target_wallet,
          target_namespace, deposit_source, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'stellar_payment', 'processing') RETURNING id`,
      [stellarTxHash, stellarPayer, ledgerSeq, usdfAmount.toFixed(7), targetWallet, targetNamespace ?? null]
    );
    depositId = ins.rows[0].id;
  }

  try {
    const accountId = await upsertCreditAccount(targetWallet, targetNamespace);
    const creditTxId = await creditAccount(accountId, usdfAmount, stellarTxHash, {
      stellar_payer: stellarPayer,
      stellar_tx_hash: stellarTxHash,
    });

    await pool.query(
      "UPDATE stellar_bridge_deposits SET status = 'settled', credit_tx_id = $1, settled_at = now() WHERE id = $2",
      [creditTxId, depositId]
    );

    return { deposit_id: depositId, usdf_amount: usdfAmount, credit_tx_id: creditTxId };
  } catch (e) {
    await pool.query(
      "UPDATE stellar_bridge_deposits SET status = 'failed', error_msg = $1 WHERE id = $2",
      [(e as Error).message, depositId]
    );
    throw e;
  }
}

/**
 * Withdraw: burn x402 credits and send real USDF from the Stellar treasury.
 */
export async function withdrawToStellar(
  x402Wallet: string,
  stellarDestination: string,
  usdfAmount: number
): Promise<{ withdrawal_id: string; stellar_tx_hash: string }> {
  if (!TREASURY_SECRET) throw new Error("STELLAR_TREASURY_SECRET not configured");

  const withRef = `withdraw:${x402Wallet}:${stellarDestination}:${usdfAmount}:${Date.now()}`;

  // Insert withdrawal as pending
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO stellar_bridge_withdrawals
       (x402_wallet, stellar_destination, usdf_amount, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [x402Wallet, stellarDestination, usdfAmount.toFixed(7)]
  );
  const withdrawalId = ins.rows[0].id;

  try {
    // Debit x402 credits first
    const creditTxId = await debitAccount(x402Wallet, usdfAmount, withRef);

    // Build Stellar payment from treasury to destination
    const keypair    = Keypair.fromSecret(TREASURY_SECRET);
    const sourceAcct = await server.loadAccount(keypair.publicKey());
    const amountStr  = usdfAmount.toFixed(7);

    const txBuilder = new TransactionBuilder(sourceAcct, {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: stellarDestination,
          asset: USDF_ASSET,
          amount: amountStr,
        })
      )
      .addMemo(Memo.text(`x402:${x402Wallet.slice(0, 20)}`))
      .setTimeout(30)
      .build();

    txBuilder.sign(keypair);
    const result = await server.submitTransaction(txBuilder);
    const stellarHash = result.hash;

    await pool.query(
      `UPDATE stellar_bridge_withdrawals
         SET status = 'settled', stellar_tx_hash = $1, credit_tx_id = $2, settled_at = now()
       WHERE id = $3`,
      [stellarHash, creditTxId, withdrawalId]
    );

    return { withdrawal_id: withdrawalId, stellar_tx_hash: stellarHash };
  } catch (e) {
    await pool.query(
      "UPDATE stellar_bridge_withdrawals SET status = 'failed', error_msg = $1 WHERE id = $2",
      [(e as Error).message, withdrawalId]
    );
    throw e;
  }
}

/** Stellar payment stream monitor — processes inbound USDF payments automatically. */
export function startMonitor(logger: { info: (msg: string) => void; error: (msg: string) => void }): void {
  if (!TREASURY_PUBLIC || !USDF_ISSUER) {
    logger.info("[StellarBridge] Monitor disabled — missing STELLAR_TREASURY_PUBLIC or STELLAR_USDF_ISSUER");
    return;
  }

  const streamPayments = () => {
    pool.query<{ paging_token: string }>("SELECT paging_token FROM stellar_bridge_cursor WHERE id = 'singleton'")
      .then(({ rows }) => {
        const cursor = rows[0]?.paging_token ?? "now";
        logger.info(`[StellarBridge] Starting payment stream from cursor: ${cursor}`);

        server
          .payments()
          .forAccount(TREASURY_PUBLIC)
          .cursor(cursor)
          .stream({
            onmessage: async (payment) => {
              const p = payment as Horizon.HorizonApi.PaymentOperationResponse;
              if (p.type !== "payment") return;
              if (p.asset_code !== "USDF" || p.asset_issuer !== USDF_ISSUER) return;
              if (p.to !== TREASURY_PUBLIC) return;

              logger.info(`[StellarBridge] Inbound USDF: ${p.amount} from ${p.from} tx ${p.transaction_hash}`);

              // Extract target wallet from transaction memo
              try {
                const txRec = await server.transactions().transaction(p.transaction_hash).call();
                const memo  = txRec.memo ?? "";
                const targetWallet = memo.startsWith("x402:") ? memo.slice(5) : p.from;

                await processStellarDeposit(p.transaction_hash, targetWallet);
                await pool.query(
                  "UPDATE stellar_bridge_cursor SET paging_token = $1, updated_at = now() WHERE id = 'singleton'",
                  [p.paging_token]
                );
              } catch (e) {
                logger.error(`[StellarBridge] Failed to process deposit ${p.transaction_hash}: ${(e as Error).message}`);
              }
            },
            onerror: (err) => {
              logger.error(`[StellarBridge] Stream error: ${String(err)}`);
              // Reconnect after 10 seconds
              setTimeout(streamPayments, 10_000);
            },
          });
      })
      .catch((e) => {
        logger.error(`[StellarBridge] Cursor load error: ${(e as Error).message}`);
        setTimeout(streamPayments, 10_000);
      });
  };

  streamPayments();
}
