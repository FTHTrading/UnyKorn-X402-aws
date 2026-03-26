# Security Policy — UnyKorn x402 Protocol

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in the UnyKorn protocol,
smart contracts, or infrastructure, please report it responsibly.

### How to Report

1. **Email**: security@fth.trading
2. **GitHub Security Advisories**: Use the [Report a vulnerability](https://github.com/FTHTrading/UnyKorn-X402-aws/security/advisories) button
3. **Do NOT** open a public issue for security vulnerabilities

### What to Include

- Affected component
- Description of the vulnerability
- Steps to reproduce
- Severity estimate
- Impact assessment
- Suggested fix (if any)

## Bug Bounty Program

We operate a tiered bug bounty program covering all UnyKorn protocol components.

### Scope

| Component | In Scope |
|-----------|----------|
| UNYToken.sol (ERC-20 contract) | Yes |
| x402 Payment Protocol | Yes |
| Facilitator Service | Yes |
| Agent Gateway | Yes |
| Rust Signer Service | Yes |
| UnyKorn L1 Ledger | Yes |
| Cloudflare Worker (api proxy) | Yes |
| Explorer (ex.unykorn.org) | Informational only |

### Bounty Tiers

| Severity | Reward | Examples |
|----------|--------|----------|
| **Critical** | $10,000 – $25,000 | Token theft, unauthorized minting, key extraction, RCE |
| **High** | $5,000 – $10,000 | Fund lockup, auth bypass, signature forgery |
| **Medium** | $1,000 – $5,000 | Denial of service, data leakage, privilege escalation |
| **Low** | $500 – $1,000 | Information disclosure, configuration issues |

### Rules

- First valid report wins (no duplicates)
- Do not exploit vulnerabilities beyond proof-of-concept
- Do not access or modify other users' data
- Allow 90 days for fix before public disclosure
- Rewards paid in USDC or UNY (reporter's choice)

### Out of Scope

- Social engineering / phishing
- Denial of service via volume (L7 DDoS)
- Issues in third-party dependencies with no demonstrated impact
- Issues requiring physical access

## Security Architecture

### Key Management
- **Rust Signer**: Ed25519 + secp256k1 keys isolated in dedicated service
- Keys never leave signer memory — operations are request-response
- Audit logging on all signing operations

### Infrastructure
- **Guardian Service**: 24/7 monitoring with auto-halt capability
- **Rate Limiting**: Per-namespace, per-route protection
- **CORS**: Strict origin allowlist on all public APIs
- **Auth**: Ed25519 signature verification on all paid routes

### Smart Contracts
- Built on OpenZeppelin v5 (battle-tested, audited base)
- Non-upgradeable, non-proxy — immutable after deployment
- No admin mint, no pause, no blacklist, no freeze functions

## Supported Versions

| Version | Supported |
|---------|-----------|
| main branch (HEAD) | Active |
| Tagged releases | Active |
| Pre-release branches | Best-effort |

## Disclosure Expectations

Responsible disclosure is expected. Public disclosure should wait until remediation is completed or authorized.
