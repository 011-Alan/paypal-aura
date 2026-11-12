# AURA — System Architecture & Security Engineering

## 1. High-Level Architecture

AURA is built around a central **Express + TypeScript Backend Integration Layer** that enforces data consistency, user ownership, family privacy boundaries, and financial execution security across the React frontend, the Python analytics engine, Google Gemini, PayPal Sandbox, and all ten hackathon sponsor technologies.

```text
USER INTERFACE (React 18 + TypeScript + Vite + Tailwind CSS)
  ├── Home, My Money, Spending (AG Grid), Financial Plan, Commitments
  ├── Financial Calendar (Bryntum), Goals, Smart Purchase Companion (Channel3 + KERNEL)
  ├── Payments (PayPal Sandbox + PIN), Family, Ask AURA (Gemini + Astropods), Automations (Zapier), Settings
        │
        ▼  HTTPS / REST API (JWT Bearer Auth + Rate Limiting + Zod/Input Validation)
AURA BACKEND API (server/src/)
  ├── Security Middleware (Argon2id Password & PIN, Short-Lived Approval Tokens, AuditLog)
  ├── Core Financial Services
  │     ├── CoreFinancialService (Accounts, Transactions, CSV Pipeline, Mandates, Goals, Family Privacy)
  │     ├── PythonAnalyticsService (Child-process JSON bridge -> server/python/analytics_engine.py)
  │     ├── PaymentGuardianService (4-Rule Policy Check, PIN Gate, Approval Token, Idempotent Capture)
  │     └── AuraAiOrchestratorService (Google Gemini + Astropods 6-Agent Routing & Ground-Truth Synthesis)
  ├── Sponsor Integration Layer (server/src/integrations/)
  │     ├── ag-grid/      (NL Query-to-Grid Filter & Aggregation Engine)
  │     ├── apimatic/     (PayPal Orders v2, OAuth2 & Webhook Contract Validator)
  │     ├── astropods/    (6-Agent Registry, Intent Router & Execution Telemetry)
  │     ├── bryntum/      (Financial Life Calendar Sync & Bidirectional Mandate Rescheduling)
  │     ├── channel3/     (Product Discovery API & 7-Factor Affordability Evaluator)
  │     ├── elastic/      (Elasticsearch Hybrid Search, Sync Retry Queue & MongoDB Truth Verification)
  │     ├── kernel/       (Read-Only Browser Research & Untrusted Input Sanitizer)
  │     ├── paypal/       (PayPal Sandbox OAuth 2.0, Orders v2 Create/Get/Capture & Webhook Verification)
  │     └── zapier/       (Zapier MCP 5-Automation Dispatcher & Deduplication Engine)
  └── Render Background Worker (server/src/workers/)
        ├── Daily Upcoming Commitment & Calendar Reminder Workflow
        ├── Post-CSV Import Analysis & Elastic Sync Workflow
        └── Elastic Retry Queue Synchroniser
        │
        ▼
DATA LAYER
  ├── MongoDB (Primary Authoritative Transactional Store — 11 Collections)
  └── Elasticsearch (Derived Search & Financial Memory Index)
```

---

## 2. Data Consistency Rules

1. **MongoDB is the Primary Source of Truth**: Account balances, transactions, confirmed mandates, payment requests, and audit logs are always persisted and verified in MongoDB first.
2. **Elasticsearch is a Derived Search System**: Whenever a transaction or financial plan is created or modified in MongoDB, `elasticIntegration` updates the corresponding Elasticsearch index (or queues it in `syncRetryQueue` if the cluster is unreachable). Every search result from Elasticsearch is validated against MongoDB (`validatedAgainstMongoDB: true`) before financial totals are returned.
3. **AG Grid and Bryntum Display Backend Truth**: Neither frontend component fabricates or independently calculates balances; all summaries and calendar events come from backend services.
4. **AI Never Invents Numbers**: Both `auraAiOrchestrator` and `agGridIntegration` compute exact totals from MongoDB/Python Analytics first and supply only verified ground-truth numbers to Gemini for phrasing.

---

## 3. Security & Financial Authority Model

- **Argon2id Hashing**: Both user passwords and 4–6 digit payment PINs are hashed using `argon2id` (`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`). Plaintext PINs are never stored, logged, or sent to any AI model.
- **Financial Guardian Policy Gate**: Every payment request is evaluated against four hard policy checks before user confirmation:
  1. Single Transaction Limit (`singleTransactionLimit`)
  2. Daily Spending Cap (`dailySpendingLimit`)
  3. Category Restriction Policy (`blockedCategories`)
  4. Account Liquidity Verification
- **Short-Lived Cryptographic Approval Tokens**: Verifying a PIN issues a 5-minute JWT approval token bound to `userId`, `paymentRequestId`, and `amountInr` (with its SHA-256 hash stored on the `PaymentRequest` document). PayPal Order v2 creation is rejected if this token is missing, expired, or mismatched.
- **Strict Family Privacy Boundaries**: In `getPrivacyPreservingFamilyOverview` (`GET /api/family`), `GET /api/accounts`, `GET /api/transactions`, and `POST /api/elastic/search`, queries are strictly scoped so another family member's personal bank accounts and private transactions (e.g., Priya's private Axis Bank account) are never exposed.
- **Untrusted Input Sanitization**: All web content retrieved via KERNEL or Channel3 passes through `sanitizeUntrustedExternalText`, stripping HTML/script tags and prompt-injection directives before AI consumption.
