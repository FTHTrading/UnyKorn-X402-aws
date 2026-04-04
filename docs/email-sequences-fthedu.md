# FTH EDU Email Sequences

## Overview

Three sequences mapped to the membership funnel:
- **Sequence 1 — Explorer welcome** (3 emails, free tier onboarding)
- **Sequence 2 — Builder upgrade** (4 emails, targeting Explorer → Builder)
- **Sequence 3 — Sovereign VIP invitation** (3 emails, targeting Operator → Sovereign)

---

## CRITICAL: Revenue Blocker (do this once, 2 minutes)

Before any of these emails generate revenue, the Stripe webhook must be registered:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. URL: `https://fthedu.unykorn.org/api/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
5. Click Save

That's it. The `STRIPE_WEBHOOK_SECRET` is already in Vercel. The handler is already built. This one step is the only thing between "Stripe charges the card" and "account gets upgraded."

---

## Sequence 1 — Explorer Welcome (Free Tier)

Send immediately on signup.

### Email 1A — Day 0 (Welcome)

**Subject:** You're in. Here's where to start.

Hi [First Name],

Welcome to The Financial Evolution.

You've joined a community of people who believe that financial sovereignty isn't something you accumulate after becoming wealthy — it's something you build deliberately, now, with the right frameworks.

Your free Explorer access gives you:
- Introductory lessons across every track
- Access to the community
- Our free AI tutor for foundational questions

The fastest way to get value from the first week: pick one track that matches where you are and go through the first three lessons. Don't try to do everything. Build a streak.

Your tracks are at: [fthedu.unykorn.org/tracks]

See you inside,  
Kevan Burns  
FTH EDU

---

### Email 1B — Day 3 (Value delivery)

**Subject:** The one financial framework we teach before anything else

Hi [First Name],

Before we talk about crypto, agents, or investment structures — there's one framework every FTH EDU student learns first.

It's called the **Sovereign Stack**:

1. Cash flow independence (income not tied to your presence)
2. Asset accumulation (ownership that compounds)
3. Structural protection (legal and jurisdictional armor)
4. Capital deployment (access to markets and instruments)

Most financial education starts at step 4. We start at step 1. Because you can't deploy capital strategically if you don't have cash flow independence first.

Your first week of lessons covers this in depth. Start with Track 1, Lesson 1 if you haven't already.

See you inside,  
Kevan

---

### Email 1C — Day 7 (Upgrade bridge)

**Subject:** What you can't see on the free plan (and why it matters)

Hi [First Name],

You've had Explorer access for a week. I want to be transparent about what's behind the next tier.

Builder ($19/month) unlocks:

- **Every published course** — full access, not previews
- **Full AI tutor** — ask anything, get curriculum-grounded answers, not generic ChatGPT responses
- **Completion certificates** — documented proof of competency, verifiable on-chain
- **Community deep-dives** — weekly sessions on live market conditions

The people getting the most out of FTH EDU are not passively consuming content. They're working through lessons, using the AI tutor as a sparring partner, and applying frameworks in real time.

If that's the kind of learning you want, Builder is where it starts.

Upgrade at: [fthedu.unykorn.org/membership]

If you want to stay on Explorer, no problem — you'll keep getting weekly content from me either way.

— Kevan

---

## Sequence 2 — Builder Upgrade (Targeting Free Users)

> Send starting Day 10 if user has NOT upgraded. Remove from sequence on upgrade.

### Email 2A — Day 0 (Internal proof)

**Subject:** What a Builder student built in 30 days

Hi [First Name],

I want to share what one of our Builder students did in his first 30 days.

He came in with a consulting practice — good income, no real assets, no passive cash flow. He worked through the Sovereign Stack track and the Capital Structures module.

By week 4 he had restructured his consulting contracts to include a retainer component, opened a self-directed account for alternative assets, and had a draft of a holding structure to protect what he was building.

None of that required starting a fund. None of it required discovering a secret investment. It required having the right frameworks and the space to apply them.

That's what Builder access creates.

[Upgrade to Builder — $19/month]

— Kevan

---

### Email 2B — Day 4 (What your Explorer cap is costing you)

**Subject:** The part of FTH EDU you can't reach yet

Hi [First Name],

Let me be specific about what Explorer doesn't include:

- The **AI Portfolio Structuring module** (live inside Builder tier)
- The **Alternative Asset Mechanics** course series
- **Weekly live sessions** with curriculum breakdown and Q&A
- **Certificates** — documented, on-chain proof of completion that you can share

The Explorer tier exists so you can evaluate whether FTH EDU is right for you. If you've done that and it is — the next step is Builder.

$19/month. Cancel any time. Upgrade instantly.

[Upgrade to Builder]

— Kevan

---

### Email 2C — Day 7 (Risk reversal)

**Subject:** Try it for a month. Then decide.

Hi [First Name],

I hear from people who sit on free tiers for months because they're not sure if a paid upgrade is worth it.

Here's what I tell them:

Work through two full courses in Builder during your first 30 days. Use the AI tutor actively — treat it like a professor you can ask anything. Show up for one live session.

If you don't feel like you've extracted at least $190 of value from a $19 month, I'll give you that month back. Email me directly.

That's the deal.

[Upgrade to Builder — $19/month]

— Kevan

---

### Email 2D — Day 11 (Final push)

**Subject:** Last email about upgrading (then I stop asking)

Hi [First Name],

This is the last time I'll bring up Builder in your inbox.

If FTH EDU isn't for you at the paid tier, no pressure. You'll keep getting the free content and community access.

But if you've been on the fence — here's the honest version of what you're waiting for:

The frameworks that change how you think about money are inside the full curriculum. The AI tutor that makes those frameworks click is inside Builder. The weekly sessions where you can apply what you're learning in real time are inside Builder.

Nineteen dollars a month.

[Upgrade to Builder]

If you do upgrade, reply to this email and tell me what track you're starting with. I'll personally send you the fastest path through it.

— Kevan

---

## Sequence 3 — Sovereign VIP Invitation (Operator → Sovereign)

> Send to Operator members who have been active for 45+ days. Sovereign = $149/month.

### Email 3A — Day 0 (Reframe value)

**Subject:** You've been on Operator for [X] days. Here's what Sovereign adds.

Hi [First Name],

You've been an active Operator member. I want to personally tell you about Sovereign — not as a generic upgrade email, but because based on what you've been working through, I think it's relevant.

Sovereign ($149/month) adds three things Operator doesn't have:

1. **Monthly 1:1 session** with me or a senior FTH faculty member — 30 minutes, your specific situation, your specific questions
2. **Governance voting** — you have direct input into curriculum development, new modules, and FTH EDU's strategic direction
3. **VIP events** — summits, working groups, and invitation-only sessions with practitioners (not just educators)

The 1:1 session alone is worth more than the subscription cost for most people at the Operator stage.

[Upgrade to Sovereign — $149/month]

Reply if you want to know what a 1:1 session looks like before deciding.

— Kevan

---

### Email 3B — Day 5 (Governance angle)

**Subject:** You should have a vote on what we build next

Hi [First Name],

One thing I didn't build FTH EDU to be is a content machine that tells people what to learn based on what's easy to produce.

Sovereign members have governance rights. They vote on:
- Which courses get prioritized in development
- Which guest practitioners get brought in
- Which markets or instruments get their own track

If you've had a moment where you wanted to tell us "this is what I actually need" — Sovereign is how you make that happen formally.

[Upgrade to Sovereign]

— Kevan

---

### Email 3C — Day 10 (Personal invitation)

**Subject:** I'd like to offer you the first 1:1

Hi [First Name],

If you upgrade to Sovereign in the next 7 days, I'll personally take your first 1:1 session.

Thirty minutes. Your situation, your questions, whatever is most useful for where you are right now.

No sales agenda. No upsell. Just a conversation about what you're trying to build and how the frameworks apply to it specifically.

Reply to this email to claim the slot, or upgrade directly: [fthedu.unykorn.org/membership]

— Kevan Burns  
Founder, FTH EDU

---
