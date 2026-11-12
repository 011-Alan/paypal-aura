---
description: "AURA Mandate Intelligence — Identifies recurring financial commitments, detects subscriptions and duplicate services, estimates upcoming payment dates, and flags changes in recurring bills."
tags:
  - finance
  - mandates
  - subscriptions
  - calendar
  - aura
authors:
  - "AURA"
capabilities:
  - "Recurring commitment and subscription detection"
  - "Upcoming payment date and cashflow estimation"
  - "Duplicate subscription and bill change alerts"
integrations: []
---

# AURA Mandate Intelligence (`aura-mandate-intelligence`)

## Overview
**AURA Mandate Intelligence** is Agent 3 of the 6-agent AURA personal financial companion architecture. It evaluates confirmed mandates, inferred recurring transactions, and calendar commitments to produce structured recurring commitment records, expected due dates, confidence levels, duplicate subscription alerts, and actionable recommendations.

## Responsibilities
- Identify recurring financial commitments and recognise recurring bills.
- Detect subscriptions and identify potential duplicate subscriptions.
- Estimate upcoming payment dates and 14-day commitment totals.
- Detect unusual changes in recurring payment amounts.

## Security & Determinism Boundaries
- Never receives raw account numbers, passwords, PINs, or payment credentials.
- Uses deterministic tools (`analyse_recurring_commitments` and `detect_duplicate_or_changed_subscriptions`).
- Cannot independently authorize or execute payments (`canExecutePayments: false`).
