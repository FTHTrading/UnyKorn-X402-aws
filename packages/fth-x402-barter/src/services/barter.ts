/**
 * Barter settlement service.
 * Handles offer creation, matching, USDF differential settlement, and value appreciation.
 */
import { PoolClient } from "pg";
import pool from "../db";

/** Default value appreciation applied to BOTH assets after each completed trade. */
export const DEFAULT_APPRECIATION_PCT = 3.0;

/** Platform fee charged to the offerer when listing (flat USDF). */
export const LISTING_FEE_USDF = 0.10;

/** Platform fee on net USDF settlement (percentage). */
export const SETTLEMENT_FEE_PCT = 0.005; // 0.5 %

// ─── Credit helpers (raw SQL, runs inside callers' transactions) ─────────────

async function chargeCredits(
  client: PoolClient,
  walletAddress: string,
  amount: number,
  reference: string
): Promise<void> {
  if (amount <= 0) return;
  const acc = await client.query<{ id: string; balance_usdf: string; frozen: boolean }>(
    "SELECT id, balance_usdf, frozen FROM credit_accounts WHERE wallet_address = $1 FOR UPDATE",
    [walletAddress]
  );
  if (!acc.rows.length)
    throw Object.assign(new Error(`No credit account for ${walletAddress}`), { statusCode: 402 });
  if (acc.rows[0].frozen)
    throw Object.assign(new Error("Credit account is frozen"), { statusCode: 403 });

  const balance = Number(acc.rows[0].balance_usdf);
  if (balance < amount)
    throw Object.assign(
      new Error(`Insufficient USDF: need ${amount.toFixed(7)}, have ${balance.toFixed(7)}`),
      { statusCode: 402 }
    );

  const newBal = (balance - amount).toFixed(7);
  await client.query(
    "UPDATE credit_accounts SET balance_usdf = $1, updated_at = now() WHERE id = $2",
    [newBal, acc.rows[0].id]
  );
  await client.query(
    `INSERT INTO credit_transactions (account_id, type, amount, balance_after, reference, rail)
     VALUES ($1, 'charge', $2, $3, $4, 'barter')`,
    [acc.rows[0].id, amount.toFixed(7), newBal, reference]
  );
}

async function depositCredits(
  client: PoolClient,
  walletAddress: string,
  amount: number,
  reference: string
): Promise<void> {
  if (amount <= 0) return;
  const acc = await client.query<{ id: string; balance_usdf: string }>(
    "SELECT id, balance_usdf FROM credit_accounts WHERE wallet_address = $1 FOR UPDATE",
    [walletAddress]
  );
  if (!acc.rows.length)
    throw Object.assign(new Error(`No credit account for ${walletAddress}`), { statusCode: 402 });

  const newBal = (Number(acc.rows[0].balance_usdf) + amount).toFixed(7);
  await client.query(
    "UPDATE credit_accounts SET balance_usdf = $1, updated_at = now() WHERE id = $2",
    [newBal, acc.rows[0].id]
  );
  await client.query(
    `INSERT INTO credit_transactions (account_id, type, amount, balance_after, reference, rail)
     VALUES ($1, 'deposit', $2, $3, $4, 'barter')`,
    [acc.rows[0].id, amount.toFixed(7), newBal, reference]
  );
}

// ─── Asset appreciation helper ───────────────────────────────────────────────

export async function appreciateAsset(
  client: PoolClient,
  assetId: string,
  appreciationPct: number,
  reason: string
): Promise<number> {
  const asset = await client.query<{ usdf_valuation: string }>(
    "SELECT usdf_valuation FROM real_assets WHERE id = $1 FOR UPDATE",
    [assetId]
  );
  if (!asset.rows.length) throw new Error(`Asset ${assetId} not found`);

  const oldVal   = Number(asset.rows[0].usdf_valuation);
  const increase = oldVal * (appreciationPct / 100);
  const newVal   = (oldVal + increase).toFixed(7);

  await client.query(
    "UPDATE real_assets SET usdf_valuation = $1, updated_at = now() WHERE id = $2",
    [newVal, assetId]
  );
  await client.query(
    "INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by) VALUES ($1, $2, $3, 'barter-engine')",
    [assetId, newVal, reason]
  );

  return Number(newVal);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CreateOfferParams {
  offerer_wallet: string;
  offered_asset_id: string;
  requested_asset_id?: string;
  requested_category?: string;
  usdf_add?: number;
  usdf_expect?: number;
  expires_hours?: number;
}

/** Create a barter offer.  Charges listing fee and marks asset as pending. */
export async function createOffer(params: CreateOfferParams): Promise<Record<string, unknown>> {
  const {
    offerer_wallet,
    offered_asset_id,
    requested_asset_id,
    requested_category,
    usdf_add = 0,
    usdf_expect = 0,
    expires_hours = 72,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify ownership
    const asset = await client.query<{ id: string; owner_wallet: string; status: string }>(
      "SELECT id, owner_wallet, status FROM real_assets WHERE id = $1 FOR UPDATE",
      [offered_asset_id]
    );
    if (!asset.rows.length)
      throw Object.assign(new Error("Offered asset not found"), { statusCode: 404 });
    if (asset.rows[0].owner_wallet !== offerer_wallet)
      throw Object.assign(new Error("Offerer does not own this asset"), { statusCode: 403 });
    if (asset.rows[0].status !== "active")
      throw Object.assign(new Error("Asset is not available for trade (status: " + asset.rows[0].status + ")"), { statusCode: 409 });

    // Charge listing fee
    await chargeCredits(client, offerer_wallet, LISTING_FEE_USDF, `barter-listing:${offered_asset_id}`);

    // Mark asset as pending
    await client.query(
      "UPDATE real_assets SET status = 'pending', updated_at = now() WHERE id = $1",
      [offered_asset_id]
    );

    const expiresAt = new Date(Date.now() + expires_hours * 3_600_000).toISOString();

    const offer = await client.query<{ id: string }>(
      `INSERT INTO barter_offers
         (offerer_wallet, offered_asset_id, requested_asset_id, requested_category,
          usdf_add, usdf_expect, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        offerer_wallet,
        offered_asset_id,
        requested_asset_id ?? null,
        requested_category ?? null,
        usdf_add.toFixed(7),
        usdf_expect.toFixed(7),
        expiresAt,
      ]
    );

    await client.query("COMMIT");

    const full = await pool.query(
      `SELECT o.*, a.name AS offered_asset_name, a.category AS offered_asset_category,
              a.usdf_valuation AS offered_asset_value
       FROM barter_offers o
       JOIN real_assets a ON a.id = o.offered_asset_id
       WHERE o.id = $1`,
      [offer.rows[0].id]
    );
    return full.rows[0] as Record<string, unknown>;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface AcceptOfferParams {
  offer_id: string;
  counterparty_wallet: string;
  counterparty_asset_id?: string;
}

/**
 * Accept a barter offer.
 *  - Settles USDF differential between parties
 *  - Transfers asset ownership
 *  - Applies value appreciation to both assets
 */
export async function acceptOffer(params: AcceptOfferParams): Promise<Record<string, unknown>> {
  const { offer_id, counterparty_wallet, counterparty_asset_id } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock offer
    const offerResult = await client.query<{
      id: string;
      offerer_wallet: string;
      offered_asset_id: string;
      requested_asset_id: string | null;
      requested_category: string | null;
      usdf_add: string;
      usdf_expect: string;
      status: string;
      expires_at: string | null;
    }>(
      "SELECT * FROM barter_offers WHERE id = $1 FOR UPDATE",
      [offer_id]
    );
    if (!offerResult.rows.length)
      throw Object.assign(new Error("Offer not found"), { statusCode: 404 });

    const offer = offerResult.rows[0];
    if (offer.status !== "open")
      throw Object.assign(new Error(`Offer is not open (status: ${offer.status})`), { statusCode: 409 });
    if (offer.expires_at && new Date(offer.expires_at) < new Date())
      throw Object.assign(new Error("Offer has expired"), { statusCode: 410 });
    if (offer.offerer_wallet === counterparty_wallet)
      throw Object.assign(new Error("Cannot accept your own offer"), { statusCode: 400 });

    // Validate counterparty asset (if offer requires specific asset or category)
    if (counterparty_asset_id) {
      const cpAsset = await client.query<{ id: string; owner_wallet: string; status: string; category: string }>(
        "SELECT id, owner_wallet, status, category FROM real_assets WHERE id = $1 FOR UPDATE",
        [counterparty_asset_id]
      );
      if (!cpAsset.rows.length)
        throw Object.assign(new Error("Counterparty asset not found"), { statusCode: 404 });
      if (cpAsset.rows[0].owner_wallet !== counterparty_wallet)
        throw Object.assign(new Error("Counterparty does not own the offered asset"), { statusCode: 403 });
      if (cpAsset.rows[0].status !== "active")
        throw Object.assign(new Error("Counterparty asset is not available"), { statusCode: 409 });
      if (offer.requested_asset_id && cpAsset.rows[0].id !== offer.requested_asset_id)
        throw Object.assign(new Error("Counterparty asset does not match requested asset"), { statusCode: 400 });
      if (offer.requested_category && cpAsset.rows[0].category !== offer.requested_category)
        throw Object.assign(new Error(`Counterparty asset must be in category: ${offer.requested_category}`), { statusCode: 400 });
    } else if (offer.requested_asset_id || offer.requested_category) {
      throw Object.assign(new Error("This offer requires a counterparty asset"), { statusCode: 400 });
    }

    const usdfAdd    = Number(offer.usdf_add);
    const usdfExpect = Number(offer.usdf_expect);

    // USDF differential settlement:
    //   offerer pays usdf_add  to counterparty
    //   counterparty pays usdf_expect to offerer
    const platformFeeBase = Math.abs(usdfAdd - usdfExpect);
    const platformFee = platformFeeBase * SETTLEMENT_FEE_PCT;

    if (usdfAdd > 0) {
      await chargeCredits(client, offer.offerer_wallet, usdfAdd, `barter-settlement:${offer_id}:offerer-pays`);
      const counterpartyNet = usdfAdd - platformFee;
      if (counterpartyNet > 0) {
        await depositCredits(client, counterparty_wallet, counterpartyNet, `barter-settlement:${offer_id}:counterparty-receives`);
      }
    }
    if (usdfExpect > 0) {
      await chargeCredits(client, counterparty_wallet, usdfExpect, `barter-settlement:${offer_id}:counterparty-pays`);
      const offererNet = usdfExpect - platformFee;
      if (offererNet > 0) {
        await depositCredits(client, offer.offerer_wallet, offererNet, `barter-settlement:${offer_id}:offerer-receives`);
      }
    }

    // Transfer offered asset (offerer → counterparty)
    await client.query(
      "UPDATE real_assets SET owner_wallet = $1, status = 'active', updated_at = now() WHERE id = $2",
      [counterparty_wallet, offer.offered_asset_id]
    );
    await client.query(
      "INSERT INTO asset_valuations (asset_id, usdf_value, reason, set_by) SELECT id, usdf_valuation, 'barter_trade', 'barter-engine' FROM real_assets WHERE id = $1",
      [offer.offered_asset_id]
    );

    // Transfer counterparty asset (counterparty → offerer), if present
    if (counterparty_asset_id) {
      await client.query(
        "UPDATE real_assets SET owner_wallet = $1, status = 'active', updated_at = now() WHERE id = $2",
        [offer.offerer_wallet, counterparty_asset_id]
      );
    }

    // Value appreciation for both assets
    const appreciationPct = DEFAULT_APPRECIATION_PCT;
    const offeredNewVal = await appreciateAsset(
      client, offer.offered_asset_id, appreciationPct, `barter_trade_appreciation:${offer_id}`
    );
    let cpNewVal: number | null = null;
    if (counterparty_asset_id) {
      cpNewVal = await appreciateAsset(
        client, counterparty_asset_id, appreciationPct, `barter_trade_appreciation:${offer_id}`
      );
    }

    // Get old values for the trade record
    const offeredOldValRow = await client.query<{ usdf_value: string }>(
      "SELECT usdf_value FROM asset_valuations WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1 OFFSET 1",
      [offer.offered_asset_id]
    );
    const offeredOldVal = offeredOldValRow.rows[0] ? Number(offeredOldValRow.rows[0].usdf_value) : null;

    // Record trade
    const trade = await client.query<{ id: string }>(
      `INSERT INTO barter_trades
         (offer_id, counterparty_wallet, counterparty_asset_id, settlement_usdf,
          asset_a_old_value, asset_b_old_value, asset_a_new_value, asset_b_new_value,
          appreciation_pct, status, settled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'settled', now()) RETURNING id`,
      [
        offer_id,
        counterparty_wallet,
        counterparty_asset_id ?? null,
        (Math.max(usdfAdd, usdfExpect)).toFixed(7),
        offeredOldVal ?? null,
        null, // counterparty old val — simplified
        offeredNewVal.toFixed(7),
        cpNewVal !== null ? cpNewVal.toFixed(7) : null,
        appreciationPct.toFixed(2),
      ]
    );

    // Close the offer
    await client.query(
      "UPDATE barter_offers SET status = 'accepted', updated_at = now() WHERE id = $1",
      [offer_id]
    );

    await client.query("COMMIT");

    // Emit trade_settled into mesh_signals so mesh-pulse can cascade
    await pool.query(
      `INSERT INTO mesh_signals (signal_type, source, subject_id, payload)
       VALUES ('trade_settled', 'barter-engine', $1, $2)`,
      [
        trade.rows[0].id,
        JSON.stringify({
          trade_id:              trade.rows[0].id,
          offer_id,
          offered_asset_id:      offer.offered_asset_id,
          requested_asset_id:    counterparty_asset_id ?? null,
          offerer_wallet:        offer.offerer_wallet,
          counterparty_wallet,
          offered_new_value:     offeredNewVal,
          counterparty_new_value: cpNewVal,
          appreciation_pct:      appreciationPct,
          settlement_usdf:       Math.max(usdfAdd, usdfExpect),
        }),
      ]
    ).catch((err) => {
      // Non-fatal — trade is settled even if mesh signal fails
      console.warn(`[barter] failed to emit trade_settled signal: ${err.message}`);
    });

    return {
      ok: true,
      trade_id: trade.rows[0].id,
      offer_id,
      offered_asset_new_value_usdf: offeredNewVal,
      counterparty_asset_new_value_usdf: cpNewVal,
      appreciation_pct: appreciationPct,
      settlement_usdf: Math.max(usdfAdd, usdfExpect),
      platform_fee_usdf: platformFee,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Cancel an offer (offerer or admin). Restores asset to active. */
export async function cancelOffer(offerId: string, walletAddress: string, isAdmin: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const offer = await client.query<{
      id: string; offerer_wallet: string; offered_asset_id: string; status: string;
    }>(
      "SELECT id, offerer_wallet, offered_asset_id, status FROM barter_offers WHERE id = $1 FOR UPDATE",
      [offerId]
    );
    if (!offer.rows.length) throw Object.assign(new Error("Offer not found"), { statusCode: 404 });
    if (offer.rows[0].status !== "open") throw Object.assign(new Error("Offer is not open"), { statusCode: 409 });
    if (!isAdmin && offer.rows[0].offerer_wallet !== walletAddress)
      throw Object.assign(new Error("Not authorized to cancel this offer"), { statusCode: 403 });

    await client.query("UPDATE barter_offers SET status = 'cancelled', updated_at = now() WHERE id = $1", [offerId]);
    await client.query("UPDATE real_assets SET status = 'active', updated_at = now() WHERE id = $1", [offer.rows[0].offered_asset_id]);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Background job: expire offers past their expiry date and restore assets. */
export async function expireStaleOffers(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expired = await client.query<{ id: string; offered_asset_id: string }>(
      `UPDATE barter_offers SET status = 'expired', updated_at = now()
       WHERE status = 'open' AND expires_at < now()
       RETURNING id, offered_asset_id`
    );
    for (const row of expired.rows) {
      await client.query(
        "UPDATE real_assets SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'pending'",
        [row.offered_asset_id]
      );
    }
    await client.query("COMMIT");
    return expired.rows.length;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
