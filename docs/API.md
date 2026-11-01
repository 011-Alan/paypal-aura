# PROJECT AURA — REST API Reference

Base URL: `http://localhost:4000/api`  
Authentication: `Authorization: Bearer <JWT_TOKEN>` (except `/health`, `/auth/*`, `/webhooks/paypal`, `/seed/reset`)

---

## 1. Authentication
- `POST /api/auth/register` — Register a new user account with Argon2id password & PIN hashing.
- `POST /api/auth/login` — Authenticate with email & password; returns JWT `token` and sanitized `user`.
- `POST /api/auth/demo-login` — Instant 1-click sign-in as fictional hackathon demo user **Alex Sharma** (`alex@aura-demo.finance`).
- `GET /api/auth/me` — Retrieve active session user profile.

## 2. User Profiles & Policies
- `GET /api/profile` — Retrieve user profile, spending preferences, and Financial Permission Policy.
- `PUT /api/profile` — Update name, monthly income, and spending preferences.
- `PUT /api/profile/policy` — Update Financial Guardian limits (`singleTransactionLimit`, `dailySpendingLimit`, `discretionaryMonthlyCap`, `requirePinAboveAmount`, `blockedCategories`).
- `PUT /api/profile/pin` — Rotate security PIN (verifies `currentPin` and hashes `newPin` with Argon2id).

## 3. Accounts
- `GET /api/accounts` — List active user accounts and combined liquidity balance.
- `POST /api/accounts` — Create a new checking, savings, wallet, or investment account.
- `PUT /api/accounts/:id` — Update account metadata, balance, or family sharing toggle.

## 4. Transactions & AG Grid Analytics
- `GET /api/transactions` — Returns authorised transactions, `agGrid` payload (`rows`, `summaryRow`, `categoryAggregations`), and `pythonAnalytics` (Pandas/Scikit-Learn trends, category breakdown, IsolationForest anomalies, and linear regression forecast).
- `POST /api/transactions` — Record a manual income or expense transaction and synchronise to Elasticsearch.
- `POST /api/transactions/ag-grid-query` — Translate a natural-language query (e.g., `"Show my dining expenditure over the last three months"`) into an AG Grid filter model and return filtered rows and verified backend totals.

## 5. CSV Imports
- `POST /api/transactions/import-csv` — Parse bank statement CSV rows, update account balance, detect recurring mandates, flag unusual spending, and run the Render post-import background pipeline.

## 6. Mandates
- `GET /api/mandates` — List confirmed and inferred recurring mandates.
- `POST /api/mandates` — Create a new recurring commitment and synchronise with the Bryntum Financial Life Calendar.
- `PATCH /api/mandates/:id/confirm` — Confirm an inferred mandate or update its due day.

## 7. Financial Plans & Recovery
- `GET /api/plans` — Retrieve active monthly financial plan and category allocations.
- `POST /api/plans/generate` — Generate or recalculate monthly allocations and recovery recommendations via the Python Analytics Engine.
- `PATCH /api/plans/:id/recovery/:recId` — Approve (`accepted`) or dismiss (`rejected`) a Financial Recovery recommendation.

## 8. Goals & Milestones
- `GET /api/goals` — List personal and shared financial goals with 25%/50%/75%/100% milestone progress.
- `POST /api/goals` — Create a new financial goal and add its target deadline to the Financial Calendar.
- `PATCH /api/goals/:id/contribute` — Record a contribution; automatically triggers Zapier milestone celebration when a milestone threshold is crossed.

## 9. Family Finance
- `GET /api/family` — Retrieve privacy-preserving household overview (shared budget, shared goals, shared commitments, shared transactions only; strictly hides other members' personal accounts and private transactions).
- `POST /api/family/shared-budget` — Update the household shared monthly budget.

## 10. Financial Calendar (Bryntum)
- `GET /api/calendar` — Retrieve Bryntum Financial Life Calendar dataset (`resources`, `events`, `supportedViews`, and 14-day upcoming commitment summary).
- `POST /api/calendar/events` — Schedule a new financial reminder or milestone event.
- `PATCH /api/calendar/events/:id/reschedule` — Bidirectionally reschedule a calendar event and update the linked recurring mandate's due date.

## 11. AI Assistant & Astropods Orchestration
- `POST /api/ai/ask` — Execute a multi-agent conversational workflow (`Workflows A–F`) returning a grounded explanation, Astropods 6-agent execution trace, AG Grid analytics, Elastic memory hits, Bryntum summary, and Channel3/PayPal preparation context.
- `GET /api/ai/agents` — List all 6 registered Astropods financial agents and recent execution traces.

## 12. Purchase Intelligence (Channel3)
- `POST /api/purchase/evaluate` — Search Channel3 products and evaluate each against 7 financial dimensions into the 4 guidance categories (`Comfortable within the current plan`, `Possible with budget adjustments`, `Better postponed`, `Not currently recommended`).

## 13. Elastic Search & Financial Memory
- `POST /api/elastic/search` — Natural-language and semantic keyword-expanded search across transactions, plans, and audit logs, validated against MongoDB (`validatedAgainstMongoDB: true`).
- `POST /api/elastic/sync` — Trigger Elastic synchronisation and flush the retry queue.

## 14. Notifications
- `GET /api/notifications` — Retrieve in-app and Zapier-dispatched notifications.
- `PATCH /api/notifications/:id/read` — Mark a notification as read.
- `POST /api/notifications/read-all` — Mark all notifications as read.

## 15. Payment Preparation (Financial Guardian)
- `GET /api/payments` — List payment requests and PayPal Sandbox integration status.
- `POST /api/payments/prepare` — Prepare a controlled payment request and run the Financial Guardian's 4-rule policy check.

## 16. PIN Verification
- `POST /api/payments/:id/verify-pin` — Verify the user's Argon2id security PIN and issue a short-lived cryptographic `approvalToken`.

## 17. PayPal Orders v2
- `POST /api/payments/:id/paypal-order` — Validate the short-lived `approvalToken`, validate the payload against APIMatic's PayPal Orders v2 contract, and create a PayPal Sandbox Order v2.
- `GET /api/payments/paypal-order/:orderId` — Retrieve PayPal Order v2 status.

## 18. PayPal Capture
- `POST /api/payments/:id/paypal-capture` — Idempotently capture an approved PayPal Order v2, deduct account balance in MongoDB, record the transaction, synchronise to Elasticsearch & Bryntum Calendar, and trigger Zapier notification.

## 19. PayPal Webhooks
- `POST /api/webhooks/paypal` — Cryptographically verify a PayPal Webhook event (`PAYMENT.CAPTURE.COMPLETED`) against APIMatic/PayPal webhook contracts and mark the payment record `webhook_verified`.

## 20. External Integrations, KERNEL, Zapier & Render Workers
- `GET /api/integrations/status` — Retrieve real-time health and responsibility status for all 10 sponsor technologies.
- `POST /api/kernel/research` — Execute controlled, sanitised browser research via KERNEL.
- `GET /api/automations` — List the 5 Zapier MCP automation rules and execution logs.
- `PATCH /api/automations/:id` — Enable, pause/revoke, or reconfigure an automation rule.
- `POST /api/automations/:id/test` — Trigger a test run for an automation rule.
- `POST /api/workers/run-daily` — Execute the Render daily commitment check and calendar sync job.
- `GET /api/audit-logs` — Retrieve security and Financial Guardian audit logs.
- `POST /api/seed/reset` — Reset demo user **Alex Sharma** and family baseline data.
