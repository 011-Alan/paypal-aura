---
description: "AURA Financial Guardian — Reviews proposed financial actions, identifies affordability concerns and policy violations, and provides structured risk assessments without replacing deterministic backend authorization."
tags:
  - finance
  - security
  - risk-assessment
  - guardian
  - aura
authors:
  - "PROJECT AURA"
capabilities:
  - "Financial constraint and spending limit validation"
  - "Pre-payment affordability and risk assessment"
  - "Missing information and policy violation detection"
integrations: []
---

# AURA Financial Guardian (`aura-financial-guardian`)

## Overview
**AURA Financial Guardian** is Agent 6 of the 6-agent PROJECT AURA personal financial companion architecture. It reviews proposed financial actions and recommendations, checks user-defined spending limits and category constraints, and returns a structured risk assessment.

## Responsibilities
- Review proposed financial actions and identify affordability concerns.
- Detect potential financial risks and check user-defined constraints.
- Identify missing information and provide structured approval/rejection recommendations.

## Critical Security Requirement
- Financial Guardian is strictly advisory (`canExecutePayments: false`) and NEVER replaces deterministic backend payment validation, Argon2id PIN verification, idempotency enforcement, or PayPal Sandbox signature verification on Render.
