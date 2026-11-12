# AURA

### Autonomous Understanding & Resource Allocation
**Your Money. Your Goals. Your Future.**

AURA is a full-stack, AI-powered personal and family financial companion engineered for the **PayPal AI Hackathon**. It combines conversational AI, a Python data-science analytics engine, multi-agent orchestration, intelligent purchase evaluation, a financial life calendar, controlled PayPal Sandbox payment execution, and **all ten hackathon sponsor technologies** into one cohesive financial ecosystem.

---

## 1. How the Ten Sponsor Technologies Work Together in AURA

Every sponsor technology has a dedicated module under `server/src/integrations/` and contributes directly to user workflows without exposing technical complexity:

1. **AG Grid / AG Studio (`server/src/integrations/ag-grid/`)**: Powers the interactive **Spending & Financial Analytics Workbench** (`AgGridReact` v32) with sorting, multi-column filtering, category aggregations, anomaly badges, and natural-language query projection (`"Show my dining expenditure over the last three months"`).
2. **APIMatic (`server/src/integrations/apimatic/`)**: Provides PayPal API contract intelligence and pre-flight OpenAPI schema validation for PayPal Orders API v2 (`/v2/checkout/orders`), OAuth 2.0 (`/v1/oauth2/token`), `PayPal-Request-Id` idempotency headers, and Webhook signature verification.
3. **Astropods (`server/src/integrations/astropods/`)**: Manages and orchestrates AURA's **6 Specialised Financial Agents**:
   - **Agent 1: Financial Planner** (`financial-planner`)
   - **Agent 2: Transaction Intelligence Agent** (`transaction-intelligence`)
   - **Agent 3: Mandate Intelligence Agent** (`mandate-intelligence`)
   - **Agent 4: Financial Recovery Agent** (`financial-recovery`)
   - **Agent 5: Purchase Intelligence Agent** (`purchase-intelligence`)
   - **Agent 6: Financial Guardian** (`financial-guardian`)
4. **Bryntum (`server/src/integrations/bryntum/`)**: Powers AURA's **Financial Life Calendar** across **Month, Week, Day, and Agenda views**, tracking salary credits, rent (`₹8,000` on 1st), insurance (`₹1,000` on 5th), internet (`₹800` on 10th), loan EMIs, electricity bills, subscriptions, savings milestones, and goal deadlines with bidirectional due-date rescheduling.
5. **Channel3 (`server/src/integrations/channel3/`)**: Powers the **Smart Purchase Companion**, connecting product discovery with AURA's **7-Factor Affordability Evaluator** and classifying options into *Comfortable within the current plan*, *Possible with budget adjustments*, *Better postponed*, or *Not currently recommended*.
6. **Elastic (`server/src/integrations/elastic/`)**: Powers **Financial Memory & Hybrid Retrieval** (`@elastic/elasticsearch`), enabling natural-language search (`"How much did I spend on travel during my last holiday?"`), background retry-queued synchronisation, and strict validation against MongoDB as the authoritative source of truth.
7. **KERNEL (`server/src/integrations/kernel/`)**: Powers **AURA Assisted Research** for controlled, read-only public product and billing tariff research with prompt-injection sanitization and strict blocks against credential storage, MFA/CAPTCHA bypass, or automated checkout.
8. **Postman (`postman/`)**: Complete **20-Folder Postman Collection** (`postman/AURA.postman_collection.json`) and Environment Template (`postman/AURA.postman_environment.json`) with automated test scripts.
9. **Render (`render.yaml` & `server/src/workers/`)**: Blueprint for deploying the React static site, Express + Python web service, and scheduled background worker jobs (daily commitment checks, post-CSV import pipeline, and Elastic retry sync).
10. **Zapier (`server/src/integrations/zapier/`)**: Powers the **AURA Automation Centre** supporting 5 user-configurable external automations (Upcoming commitment reminder, Financial milestone, Monthly financial summary, Payment status notification, Financial calendar reminder) while never bypassing the Financial Guardian.

---

## 2. Quickstart Instructions

### Prerequisites
- **Node.js** v20+ (tested on v24.12.0)
- **Python** 3.10+ with `pandas`, `numpy`, and `scikit-learn` (tested on Python 3.11)
- **MongoDB** running locally on `mongodb://127.0.0.1:27017/aura_fintech` or a MongoDB Atlas URI

### 1. Configure Environment
Copy `.env.example` to `server/.env` and customize any optional external API keys (`GEMINI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `ELASTICSEARCH_URL`, `CHANNEL3_API_KEY`, `ASTROPODS_API_KEY`, `KERNEL_API_KEY`, `ZAPIER_WEBHOOK_URL`):

```bash
cp .env.example server/.env
```

### 2. Install & Build
```bash
# Install backend and frontend dependencies
cd server && npm install
cd ../client && npm install

# Build production bundles
cd ../server && npm run build
cd ../client && npm run build
```

### 3. Seed Demo Story ("Alex Sharma") & Run Tests
```bash
cd server
npm run seed
npm test
```

### 4. Start Development Servers
```bash
# Terminal 1: Start Backend API on http://localhost:4000
cd server && npm run dev

# Terminal 2: Start Frontend UI on http://localhost:5173
cd client && npm run dev
```

---

## 3. End-to-End Hackathon Demonstration Story (User: Alex Sharma)

| Demo Credential | Value |
| :--- | :--- |
| **Email** | `alex@aura-demo.finance` |
| **Password** | `AuraDemo#2026` |
| **Argon2id Payment Security PIN** | `4826` |
| **Family Member Profile (Privacy Demo)** | `priya@aura-demo.finance` |

1. **Onboarding & Home**: Click **"Enter as Alex"** on the login screen or sign in with `alex@aura-demo.finance`. View Alex's `₹3,87,700` combined liquidity across 3 accounts, `₹95,000` monthly income, Python-calculated expenditure forecast, and cashflow charts.
2. **My Money & CSV Import**: Open **My Money** to view Alex's Checking, High-Yield Savings, and PayPal Sandbox Wallet accounts. Import a CSV bank statement and watch the Render post-import worker update MongoDB, run Python IsolationForest anomaly detection, infer recurring mandates, and sync to Elastic.
3. **Spending (AG Grid + Elastic)**: Open **Spending** and click `"Show my dining expenditure over the last three months."` Watch AG Grid filter to Alex's multi-month dining records with verified backend totals. Next, click `"How much did I spend on travel during my last holiday?"` to retrieve Alex's 3 Goa holiday transactions (`₹31,400`) via Elastic Financial Memory validated against MongoDB.
4. **Upcoming Commitments & Bryntum Financial Calendar**: Open **Upcoming Commitments** to confirm the inferred streaming mandate, then open **Financial Calendar** to explore Alex's Rent (`₹8,000` on 1st), Insurance (`₹1,000` on 5th), and Internet (`₹800` on 10th) across Month, Week, Day, and Agenda views. Reschedule a due date and observe bidirectional mandate synchronisation.
5. **Financial Plan & Recovery (Python + Astropods)**: Open **Financial Plan** to inspect Python-calculated budget allocations and approve a non-judgmental **Financial Recovery** adjustment after Alex's fine-dining spike.
6. **Smart Purchase Companion (Channel3 + KERNEL)**: Open **Smart Purchase Companion** and ask `"Can I afford a laptop for ₹55,000?"` Review the 7-factor affordability evaluation (`Better postponed` vs `Comfortable within the current plan`), inspect KERNEL Assisted Research warranty benchmarks, and click **Start Savings Plan** or **Prepare PayPal Checkout**.
7. **Controlled PayPal Sandbox Payment (PayPal + APIMatic + Financial Guardian)**: Open **Payments**, prepare a `₹5,000` payment, review the Financial Guardian's 4-rule check, enter PIN `4826` to issue a short-lived approval token, create & capture the PayPal Sandbox Order v2, and verify the PayPal Webhook signature.
8. **Family Finance Privacy Boundaries**: Open **Family** to inspect The Sharma Household's `₹40,000` shared budget while verifying that Priya's personal Axis Bank account and private transactions remain strictly hidden.
9. **Automations (Zapier MCP) & Settings**: Open **Automations** to test any of the 5 Zapier rules and **Settings** to inspect the live 10-Sponsor Integration Health Matrix and Security Audit Log.

---

## 4. Documentation Index
- [System Architecture & Security Model](docs/ARCHITECTURE.md)
- [Sponsor Integrations Verification & Status Table](docs/SPONSOR_INTEGRATIONS.md)
- [REST API Reference (20 Domains)](docs/API.md)
- [Testing & Verification Guide](docs/TESTING.md)
- [Open Source License (MIT)](LICENSE)
