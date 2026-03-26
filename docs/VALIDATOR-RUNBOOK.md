# UnyKorn — Validator Runbook

**Version:** 1.0.0  
**Last Updated:** 2026-03-26  
**Status:** PLANNED — No external validators yet  
**Owner:** FTH Trading / UnyKorn Protocol

---

## 1. Current State

| Metric | Value |
|--------|-------|
| Network | UnyKorn L1 (Chain 7331) |
| Consensus | Trinity Consensus (PoS + PoA + BFT) |
| Active Validators | 1 (founding team) |
| External Validators | 0 (not yet open) |
| Block Time | ~1 second (target) |
| Finality | ~1–2 seconds (target, unverified) |

> **Note:** This runbook is forward-looking. The validator program is not yet open.
> Current block production is single-operator on a controlled devnet.

---

## 2. Hardware Requirements (Target)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 16 GB | 32 GB |
| Storage | 500 GB NVMe SSD | 1 TB NVMe SSD |
| Network | 100 Mbps, static IP | 1 Gbps, static IP |
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |

---

## 3. Staking Requirements (Target)

| Parameter | Value |
|-----------|-------|
| Minimum Stake | 100,000 UNY |
| Unbonding Period | 14 days |
| Slashing (downtime) | 0.1% per incident |
| Slashing (double-sign) | 5% + permanent ban |
| Reward Rate | Variable (based on x402 revenue) |
| Maximum Validators | 100 (epoch-determined) |

---

## 4. Setup (Planned)

```bash
# 1. Download the UnyKorn node binary
curl -L https://releases.unykorn.org/node/latest -o unykorn-node

# 2. Initialize the node
./unykorn-node init --chain-id 7331 --moniker "my-validator"

# 3. Configure
cp genesis.json ~/.unykorn/config/genesis.json
# Edit config.toml with persistent peers

# 4. Start the node (sync first)
./unykorn-node start --sync-mode fast

# 5. Create validator (after sync)
./unykorn-node tx staking create-validator \
  --amount 100000000000000000000000uny \
  --moniker "my-validator" \
  --commission-rate 0.05 \
  --commission-max-rate 0.20 \
  --commission-max-change-rate 0.01

# 6. Verify
./unykorn-node query staking validator $(./unykorn-node keys show my-key --bech val -a)
```

> **Warning:** These commands are planned specifications. The node binary does not yet exist as a public release.

---

## 5. Monitoring

Validators should monitor:

| Metric | Alert Threshold |
|--------|----------------|
| Block production | Missed 10+ blocks in a row |
| Disk usage | > 80% capacity |
| Memory usage | > 80% capacity |
| Peer count | < 5 connected peers |
| Clock drift | > 1 second NTP drift |
| Process uptime | Service restart detected |

---

## 6. Upgrades

- **Governance upgrades:** Announced 7 days in advance via GitHub + validator mailing list
- **Emergency patches:** Communicated via direct email to all validators
- **Binary updates:** Published to releases.unykorn.org (planned)

---

## 7. Contact

| Purpose | Contact |
|---------|---------|
| Validator support | validators@unykorn.org |
| Security issues | security@unykorn.org |
| General | info@unykorn.org |

---

*This document is maintained as part of the Exchange Readiness OS.*  
*All specifications are subject to change before mainnet launch.*
