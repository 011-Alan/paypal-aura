# AURA — Quality Assurance, Integration & Security Testing Guide

## 1. Automated End-to-End Integration & Security Test Suite

AURA includes a self-contained, zero-mock database integration test suite in `server/src/tests/runAllTests.ts` that runs against a live MongoDB instance (`mongodb://127.0.0.1:27017/aura_fintech`) and the Python (`pandas`, `numpy`, `scikit-learn`) analytics engine.

### Running the Test Suite

```bash
cd server
npm test
```

### What the 22 Automated Tests Verify

1. **Health & MongoDB Connectivity** (`GET /api/health`)
2. **Authentication Gate Enforcement** (`GET /api/auth/me` rejects missing Bearer token with `401`)
3. **Argon2id Authentication & Secret Sanitization** (`POST /api/auth/login` returns JWT and never leaks `passwordHash` or `pinHash`)
4. **Account Ownership & Family Privacy Isolation** (`GET /api/accounts` returns Alex's 3 accounts and never exposes Priya's private Axis Bank account)
5. **Sponsor 1 (AG Grid)**: Natural-language query `"Show my dining expenditure over the last three months"` filters multi-month dining records and calculates exact backend totals
6. **CSV Import & Sponsor 9 (Render Worker)**: Imports CSV statement rows, updates MongoDB balance, and runs the post-import analysis pipeline
7. **Recurring Mandate Detection & Confirmation**: Verifies Rent (`₹8,000` on 1st), Insurance (`₹1,000` on 5th), Internet (`₹800` on 10th), and confirms inferred mandates
8. **Sponsor 4 (Bryntum Financial Life Calendar)**: Verifies Month/Week/Day/Agenda support and tests bidirectional rescheduling (`PATCH /api/calendar/events/:id/reschedule` updates the linked Mandate's due day)
9. **Sponsor 6 (Elastic Financial Memory)**: Tests `"How much did I spend on travel during my last holiday?"`, verifies `validatedAgainstMongoDB: true`, confirms exact `₹31,400` Goa travel total, and verifies family privacy isolation
10. **Workflow A & Sponsor 5 (Channel3) & Sponsor 3 (Astropods)**: Tests `"Can I afford a laptop for ₹55,000?"` routing through `purchase-intelligence` agent and 7-factor affordability evaluation
11. **Workflow B & F (Python Analytics Engine)**: Generates monthly financial plan and recovery recommendations using Pandas, NumPy, and Scikit-Learn
12. **Financial Goals & Sponsor 10 (Zapier)**: Contributes to a goal, crosses the 75% milestone, and triggers the Zapier milestone celebration automation
13. **Family Finance Privacy Boundary**: Verifies `privacyBoundaryPolicy.enforced === true` and ensures non-shared personal transactions are never leaked
14. **Sponsor 7 (KERNEL Assisted Research)**: Verifies sanitised public product research and confirms `400` security block when a prompt attempts password/CAPTCHA/auto-pay actions
15. **Workflow E Step 1 (Payment Preparation)**: Prepares a `₹5,000` payment request and verifies the Financial Guardian's 4-rule policy evaluation
16. **Workflow E Step 2a (Approval Token Security)**: Confirms PayPal Order creation is blocked (`400`) if a forged or unverified approval token is supplied
17. **Workflow E Step 2b (Argon2id PIN Rejection)**: Confirms wrong PIN (`9999`) is rejected with `401` and logged to `AuditLog`
18. **Workflow E Step 2c (Valid Argon2id PIN Verification)**: Verifies PIN `4826` and issues a short-lived cryptographic `approvalToken`
19. **Workflow E Step 3 (PayPal Order v2 & Sponsor 2 APIMatic)**: Creates a PayPal Sandbox Order v2 and verifies `apimaticValidation.valid === true`
20. **Workflow E Step 4 (PayPal Capture & Idempotency)**: Captures the order, verifies MongoDB transaction creation (`₹5,000`), and confirms a second capture call is handled idempotently (`alreadyCaptured: true`)
21. **Workflow E Step 5 (PayPal Webhook Verification)**: Verifies `PAYMENT.CAPTURE.COMPLETED` webhook signature and transitions status to `webhook_verified`
22. **Sponsor 9 & 10 (Render Daily Worker & 10-Sponsor Health Matrix)**: Executes daily commitment worker and verifies all 10 sponsor integration health endpoints

---

## 2. Postman 20-Folder Collection

Import both files from the `postman/` directory into Postman:
1. `postman/AURA.postman_collection.json` (All 20 required folders with automated `pm.test` scripts)
2. `postman/AURA.postman_environment.json` (Environment template with zero hardcoded secrets)
