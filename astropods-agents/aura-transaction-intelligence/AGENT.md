---
description: "AURA Transaction Intelligence — Analyses financial transactions, classifies spending categories, detects unusual expenditure, and explains behavioural spending trends."
tags:
  - finance
  - transactions
  - anomaly-detection
  - aura
authors:
  - "AURA"
capabilities:
  - "Transaction classification and category aggregation"
  - "Unusual expenditure and spike detection"
  - "Behavioural spending trend explanations"
integrations: []
---

# AURA Transaction Intelligence (`aura-transaction-intelligence`)

## Overview
**AURA Transaction Intelligence** is Agent 2 of the 6-agent AURA personal financial companion architecture. It analyses sanitized transaction summaries, category distributions, and anomaly candidates to produce structured spending insights, anomaly observations, and clear trend explanations.

## Responsibilities
- Analyse financial transactions across authorised accounts.
- Identify spending patterns and categorise expenditure.
- Detect unusual expenditure and category spikes.
- Identify changes in spending behaviour and explain trends without judgement.

## Security & Determinism Boundaries
- Never receives raw account numbers, passwords, PINs, or payment credentials.
- Uses deterministic aggregation tools (`classify_and_aggregate_transactions` and `detect_spending_anomalies`).
- Cannot independently authorize or execute payments (`canExecutePayments: false`).
