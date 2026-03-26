# UnyKorn — Incident Response Plan

**Version:** 1.0.0  
**Last Updated:** 2026-03-26  
**Owner:** FTH Trading / UnyKorn Protocol

---

## 1. Severity Levels

| Level | Description | Response Time | Notify Exchanges? |
|-------|-------------|---------------|-------------------|
| **SEV1** | Complete network outage, active exploit, funds at risk | 15 minutes | **Yes** — immediate |
| **SEV2** | Partial outage, potential vulnerability, degraded performance | 1 hour | **Yes** — within 2 hours |
| **SEV3** | Minor degradation, non-critical bug, elevated error rates | 4 hours | No |
| **SEV4** | Cosmetic issue, documentation error, planned maintenance | 24 hours | No |

---

## 2. Escalation Path

| Priority | Contact | Method | Response SLA |
|----------|---------|--------|--------------|
| Primary | Kevan Thompson (Lead Developer) | Email: kevan@unykorn.org | 15 min (SEV1), 1 hr (SEV2) |
| Security | security@unykorn.org | Email | 1 hr (SEV1), 4 hr (SEV2) |

---

## 3. Communication Channels

1. **GitHub Issues** — Public incident tracking (github.com/FTHTrading/UnyKorn-X402-aws/issues)
2. **Email** — security@unykorn.org for security disclosures
3. **Exchange Notification** — Direct email/API to exchange ops teams (once established)
4. **Status Page** — [PLANNED] Public status page for real-time updates

---

## 4. Incident Response Process

### 4.1 Detection
- Guardian daemon alerts (circuit-breaker pattern)
- Monitoring dashboards
- External reports (security@ email, GitHub issues)

### 4.2 Triage
1. Confirm the issue is real (not false positive)
2. Classify severity (SEV1-4)
3. Assign incident commander

### 4.3 Containment
- SEV1: Activate circuit breaker, halt affected services
- SEV2: Isolate affected component, enable enhanced logging
- SEV3/4: Document and schedule fix

### 4.4 Resolution
- Develop and test fix
- Deploy fix with rollback plan
- Verify resolution

### 4.5 Communication
- Update status page (once built)
- Notify exchanges (SEV1/SEV2)
- Post to GitHub

### 4.6 Post-Mortem
- **Required for:** SEV1 and SEV2
- **Timeline:** Within 72 hours
- **Format:** Public post-mortem on GitHub
- **Contents:** Timeline, root cause, impact, resolution, prevention measures

---

## 5. Exchange Notification Template

```
Subject: [UnyKorn] [SEV{X}] {Title}

Exchange: {exchange_name}
Severity: SEV{X}
Status: {investigating|identified|monitoring|resolved}
Impact: {description of impact on exchange operations}

Timeline:
- {time}: {event}

Current Status: {current status}
ETA to Resolution: {ETA}

Action Required: {what the exchange should do, if anything}

Contact: security@unykorn.org
```

---

## 6. Responsible Disclosure

If you find a security vulnerability:

1. **Do NOT** disclose publicly
2. Email: security@unykorn.org
3. Include: description, steps to reproduce, potential impact
4. We will acknowledge within 24 hours
5. We will provide updates every 72 hours
6. Bug bounty rewards: [PLANNED — Immunefi program]

---

*This document is maintained as part of the Exchange Readiness OS.*
