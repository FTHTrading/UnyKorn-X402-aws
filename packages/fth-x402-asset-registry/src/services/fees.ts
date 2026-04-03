/** Platform fee in USDF charged on asset registration. */
export const REGISTRATION_FEE_USDF = 0.5;

/** Platform fee as percentage of asset value charged on ownership transfer. */
export const TRANSFER_FEE_PCT = 0.01;  // 1 %

/**
 * Charge USDF from a credit account. Returns the new balance.
 * Runs inside the caller's transaction (client passed in).
 */
import { PoolClient } from "pg";

export async function chargeAccount(
  client: PoolClient,
  walletAddress: string,
  amount: number,
  reference: string
): Promise<number> {
  const acc = await client.query<{ id: string; balance_usdf: string; frozen: boolean }>(
    "SELECT id, balance_usdf, frozen FROM credit_accounts WHERE wallet_address = $1 FOR UPDATE",
    [walletAddress]
  );
  if (!acc.rows.length) throw Object.assign(new Error(`No credit account for wallet: ${walletAddress}`), { statusCode: 402 });
  if (acc.rows[0].frozen) throw Object.assign(new Error("Credit account is frozen"), { statusCode: 403 });

  const balance = Number(acc.rows[0].balance_usdf);
  if (balance < amount)
    throw Object.assign(
      new Error(`Insufficient USDF balance: have ${balance.toFixed(7)}, need ${amount.toFixed(7)}`),
      { statusCode: 402 }
    );

  const newBalance = balance - amount;
  await client.query(
    "UPDATE credit_accounts SET balance_usdf = $1, updated_at = now() WHERE id = $2",
    [newBalance.toFixed(7), acc.rows[0].id]
  );
  await client.query(
    `INSERT INTO credit_transactions (account_id, type, amount, balance_after, reference, rail)
     VALUES ($1, 'charge', $2, $3, $4, 'asset-registry')`,
    [acc.rows[0].id, amount.toFixed(7), newBalance.toFixed(7), reference]
  );

  return newBalance;
}
