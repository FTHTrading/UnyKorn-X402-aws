export interface BridgeDeposit {
  id: string;
  stellar_tx_hash: string;
  stellar_payer: string;
  stellar_ledger_seq: number;
  usdf_amount: string;
  target_wallet: string;
  target_namespace: string | null;
  credit_tx_id: string | null;
  deposit_source: "stellar_payment" | "admin_seed" | "treasury_reserve";
  status: "pending" | "processing" | "settled" | "failed";
  error_msg: string | null;
  created_at: string;
  settled_at: string | null;
}

export interface BridgeWithdrawal {
  id: string;
  x402_wallet: string;
  stellar_destination: string;
  usdf_amount: string;
  stellar_tx_hash: string | null;
  credit_tx_id: string | null;
  status: "pending" | "processing" | "settled" | "failed";
  error_msg: string | null;
  created_at: string;
  settled_at: string | null;
}

export interface SeedRequest {
  wallet_address: string;
  usdf_amount: number;
  namespace?: string;
  reference?: string;
}

export interface WithdrawRequest {
  x402_wallet: string;
  stellar_destination: string;
  usdf_amount: number;
}
