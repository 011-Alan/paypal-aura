# PROJECT AURA — Sponsor Integrations Verification & Engineering Specification

This document details how each of the **ten hackathon sponsor technologies**—alongside **PayPal Sandbox**, **Google Gemini**, **Python Analytics**, and **MongoDB**—is integrated into **PROJECT AURA (Autonomous Understanding & Resource Allocation)** with a clearly defined architectural responsibility, strict security boundaries, and verified graceful degradation.

---

## Integration Status Table

| Technology          | Intended responsibility            | Status | Verified workflow |
| ------------------- | ---------------------------------- | ------ | ----------------- |
| AG Grid / AG Studio | Financial analytics                | Verified (`ag-grid-react` v32 + NL Query Engine) | Multi-account sortable/filterable transaction workbench, category aggregation, anomaly badges & natural-language query (`"Show my dining expenditure over the last three months"`) |
| APIMatic            | PayPal API development context     | Verified (Pre-flight Contract Validator) | Enforces PayPal Orders API v2 (`/v2/checkout/orders`), OAuth 2.0 (`/v1/oauth2/token`), idempotency headers (`PayPal-Request-Id`), and Webhook signature verification schemas |
| Astropods           | Agent management                   | Verified (6-Agent Orchestrator & Pod Registry) | Routes and traces 6 specialised financial agents (`Financial Planner`, `Transaction Intelligence`, `Mandate Intelligence`, `Financial Recovery`, `Purchase Intelligence`, `Financial Guardian`) |
| Bryntum             | Financial calendar                 | Verified (Multi-View Financial Life Calendar) | Month, Week, Day & Agenda views displaying Salary, Rent (`₹8,000` on 1st), Insurance (`₹1,000` on 5th), Internet (`₹800` on 10th), EMIs, Milestones & bidirectional due-date sync |
| Channel3            | Product discovery                  | Verified (Smart Purchase Companion + 7-Factor Evaluator) | Live Channel3 API connector (`CHANNEL3_API_KEY`) with clearly labelled reference catalog fallback + 7-factor affordability evaluation & 4 guidance tiers |
| Elastic             | Financial retrieval                | Verified (`@elastic/elasticsearch` + MongoDB Truth Sync) | Natural-language transaction search (`"How much did I spend on travel during my last holiday?"`), semantic keyword expansion, retry queue & strict MongoDB validation |
| KERNEL              | Browser-assisted research          | Verified (Controlled Assisted Research + Sanitizer) | Read-only public product/tariff research (`KERNEL_API_KEY`) with prompt-injection sanitization, credential/MFA block guardrails & honest offline fallback |
| Postman             | API testing                        | Verified (20-Folder Collection + Environment Template) | Exported in `postman/AURA.postman_collection.json` and `postman/AURA.postman_environment.json` with automated `pm.test` status, auth, validation & payment assertions |
| Render              | Deployment and background services | Verified (`render.yaml` + Background Worker Service) | Multi-service Render Blueprint (Static Frontend, Express Web Service, Scheduled Daily Worker for commitment checks, post-CSV pipeline & Elastic retry sync) |
| Zapier              | External workflow automation       | Verified (AURA Automation Centre — 5 Automations) | User-configurable Zapier MCP / Webhook dispatch (`ZAPIER_API_KEY` / `ZAPIER_WEBHOOK_URL`) for commitment reminders, milestones, monthly digests, payment receipts & calendar sync |

---

## Detailed Sponsor Tool Specifications

### 1. AG Grid / AG Studio — Financial Analytics Engine
1. **Role in AURA**: Primary interactive transaction exploration and financial analytics table in the **Spending** page (`client/src/pages/SpendingPage.tsx`) and backend aggregation engine (`server/src/integrations/ag-grid/index.ts`).
2. **Why it is needed**: Ordinary transaction lists cannot handle multi-dimensional filtering, sorting, category grouping, anomaly inspection, and natural-language filter projection across hundreds of multi-account records.
3. **Application feature using it**: **Spending & Financial Analytics Workbench** (`SpendingPage.tsx`) and **Ask AURA** natural-language analytics (`Workflow C`).
4. **How it communicates with the backend**: Frontend requests `GET /api/transactions` and `POST /api/transactions/ag-grid-query`. Backend returns deterministic row payloads, pinned summary metrics, category aggregations, and `appliedFilterModel`.
5. **What data it receives**: Natural-language query strings or structured filter parameters (`categoryFilter`, `typeFilter`, `dateFrom`, `dateTo`, `onlyUnusual`, `minAmount`, `searchQuery`).
6. **What data it returns**: `AgGridAnalyticsPayload` containing `rows`, `summaryRow` (`totalIncome`, `totalExpense`, `netAmount`, `unusualCount`, `averageExpense`), `categoryAggregations`, and `appliedFilterModel`.
7. **How its output affects UX**: Users can sort, filter by category/account/date, toggle unusual spending spikes, or type `"Show my dining expenditure over the last three months"` and watch AG Grid immediately filter to matching dining records with verified backend totals.
8. **What happens when unavailable**: Uses `ag-grid-community` / `ag-grid-react` v32 embedded directly in the client bundle; honestly reports Community edition unless an enterprise `AG_GRID_LICENSE_KEY` and `AG_STUDIO_ENABLED=true` are provided.
9. **How the integration was tested**: Automated integration test #5 (`POST /api/transactions/ag-grid-query`) and Postman Folder 4.
10. **Implementation files**: `server/src/integrations/ag-grid/index.ts`, `client/src/pages/SpendingPage.tsx`.

---

### 2. APIMatic — PayPal API Development Intelligence
1. **Role in AURA**: Development-time PayPal API contract intelligence and pre-flight schema validator (`server/src/integrations/apimatic/index.ts`).
2. **Why it is needed**: Ensures AURA's PayPal integration strictly follows official PayPal Orders API v2 (`/v2/checkout/orders`), OAuth 2.0 (`/v1/oauth2/token`), and Webhooks v1 (`/v1/notifications/verify-webhook-signature`) specifications, avoiding deprecated `v1/payments` endpoints or malformed currency payloads.
3. **Application feature using it**: **PayPal Sandbox Execution Layer** (`server/src/integrations/paypal/index.ts`) and **Settings / Ecosystem Status Matrix**.
4. **How it communicates with the backend**: Invoked synchronously by `paypalIntegration.createOrder` and `paypalIntegration.verifyWebhookSignature` prior to any PayPal API dispatch.
5. **What data it receives**: Outgoing PayPal Orders v2 JSON payloads, HTTP headers (`PayPal-Request-Id`), and incoming PayPal Webhook transmission headers.
6. **What data it returns**: `ApimaticContractCheckResult` (`valid`, `endpoint`, `specVersion`, `checkedRules`, `errors`).
7. **How its output affects UX**: Prevents malformed payment requests and displays contract verification badges in the Controlled Payment workflow.
8. **What happens when unavailable**: APIMatic is a development-time contract intelligence layer and local schema validator; AURA does not depend on a fabricated external runtime APIMatic API.
9. **How the integration was tested**: Automated integration test #19 (`POST /api/payments/:id/paypal-order` verifies `apimaticValidation.valid === true`) and Postman Folder 17.
10. **Implementation files**: `server/src/integrations/apimatic/index.ts`, `server/src/integrations/paypal/index.ts`.

---

### 3. Astropods — AURA Agent Management and Orchestration
1. **Role in AURA**: Manages, routes, and records execution telemetry for AURA's 6 specialised financial agents (`server/src/integrations/astropods/index.ts`).
2. **Why it is needed**: Structures AI financial intelligence into cooperating, single-responsibility agents that share authorised backend context rather than operating as an unstructured chatbot.
3. **Application feature using it**: **Ask AURA** (`client/src/pages/AskAuraPage.tsx`) and all 6 multi-sponsor workflows (`Workflows A–F`).
4. **How it communicates with the backend**: `auraAiOrchestrator` calls `astropodsIntegration.routeIntent(prompt)` and `astropodsIntegration.executeCoordinatedWorkflow(...)`. When `ASTROPODS_API_KEY` is configured, run telemetry is also POSTed to `${ASTROPODS_API_URL}/workspaces/${ASTROPODS_WORKSPACE_ID}/runs`.
5. **What data it receives**: User prompt, authorised financial context summary (income, commitments, transaction counts, anomaly counts, Channel3 product counts), and Financial Guardian policy verdict.
6. **What data it returns**: `OrchestratedWorkflowResult` with `workflowId`, `primaryAgent`, `participatingAgents`, step-by-step agent execution traces, and `guardianVerdict` (`canExecutePayments: false`).
7. **How its output affects UX**: Users see transparent step-by-step agent collaboration traces in **Ask AURA** while the **Financial Guardian** enforces that no agent can independently execute a payment.
8. **What happens when unavailable**: If `ASTROPODS_API_KEY` is not set or the remote pod endpoint is unreachable, AURA seamlessly runs the local Astropods orchestrator runtime with full execution tracing.
9. **How the integration was tested**: Automated integration test #10 (`POST /api/ai/ask`) and Postman Folder 11.
10. **Implementation files**: `server/src/integrations/astropods/index.ts`, `server/src/services/planning/aiOrchestratorService.ts`, `client/src/pages/AskAuraPage.tsx`.

---

### 4. Bryntum — Financial Life Calendar
1. **Role in AURA**: Powers AURA's dedicated **Financial Life Calendar** (`server/src/integrations/bryntum/index.ts` and `client/src/pages/FinancialCalendarPage.tsx`).
2. **Why it is needed**: Gives users a temporal view of their financial life—connecting salary dates, rent due dates (`₹8,000` on the 1st), insurance premiums (`₹1,000` on the 5th), internet bills (`₹800` on the 10th), loan EMIs, electricity bills, subscription renewals, savings milestones, and goal deadlines.
3. **Application feature using it**: **Financial Calendar** page (`Month`, `Week`, `Day`, and `Agenda` views), **Upcoming Commitments**, and **Ask AURA** (`"What payments are coming up next week?"`).
4. **How it communicates with the backend**: `GET /api/calendar`, `POST /api/calendar/events`, and `PATCH /api/calendar/events/:id/reschedule`.
5. **What data it receives**: Confirmed & inferred `MandateModel` records, active `GoalModel` deadlines, and user rescheduling updates (`newStartDate`).
6. **What data it returns**: Bryntum CRUD Manager compatible dataset (`resources`, `events`, `supportedViews`, and 14-day upcoming commitment summaries).
7. **How its output affects UX**: Users can switch between Month, Week, Day, and Agenda views, filter by resource category, and reschedule a due date—which bidirectionally updates the underlying Mandate in MongoDB.
8. **What happens when unavailable**: Built-in multi-view calendar UI renders the Bryntum event/resource store directly without external cloud dependencies.
9. **How the integration was tested**: Automated integration test #8 (`GET /api/calendar` and `PATCH /api/calendar/events/:id/reschedule`) and Postman Folder 10.
10. **Implementation files**: `server/src/integrations/bryntum/index.ts`, `client/src/pages/FinancialCalendarPage.tsx`.

---

### 5. Channel3 — Intelligent Shopping and Purchase Decisions
1. **Role in AURA**: Powers the **Smart Purchase Companion** (`server/src/integrations/channel3/index.ts` and `client/src/pages/SmartPurchasePage.tsx`).
2. **Why it is needed**: Connects real product discovery (prices, descriptions, images, variants, availability, retailer info, purchase links) with AURA's 7-factor financial affordability evaluation engine.
3. **Application feature using it**: **Smart Purchase Companion** (`SmartPurchasePage.tsx`) and **Workflow A** (`"Can I afford a laptop for ₹55,000?"`).
4. **How it communicates with the backend**: `POST /api/purchase/evaluate` calls `channel3Integration.searchProducts` (`GET ${CHANNEL3_API_URL}/products/search` with Bearer `CHANNEL3_API_KEY`) followed by `channel3Integration.evaluateProductsAffordability`.
5. **What data it receives**: Product search query, optional price ceiling, and the user's 7 financial context dimensions (price, discretionary budget, upcoming commitments, active goals, savings targets, recent 30-day spend, risk tolerance).
6. **What data it returns**: Product options classified into 4 guidance categories (`Comfortable within the current plan`, `Possible with budget adjustments`, `Better postponed`, `Not currently recommended`) plus a tailored multi-month savings plan.
7. **How its output affects UX**: Users see immediately whether a purchase fits their current plan, requires adjustments, or is better postponed with a 1-click savings goal creator or controlled PayPal checkout preparation.
8. **What happens when unavailable**: When `CHANNEL3_API_KEY` is not configured or unreachable, AURA never fabricates a live API claim; it clearly labels `source: 'reference_catalog_fallback'` while running the full real-time 7-factor affordability calculation.
9. **How the integration was tested**: Automated integration test #10 (`POST /api/ai/ask` & `POST /api/purchase/evaluate`) and Postman Folder 12.
10. **Implementation files**: `server/src/integrations/channel3/index.ts`, `client/src/pages/SmartPurchasePage.tsx`.

---

### 6. Elastic — Financial Memory and Intelligent Retrieval
1. **Role in AURA**: Derived search, natural-language retrieval, and historical context service (`server/src/integrations/elastic/index.ts`) using `@elastic/elasticsearch`.
2. **Why it is needed**: Enables fast natural-language and semantic keyword-expanded search across historical transactions, financial plans, recovery recommendations, and audit logs while preserving MongoDB as the authoritative source of truth.
3. **Application feature using it**: **Spending** natural-language search (`"How much did I spend on travel during my last holiday?"`), **Ask AURA** context retrieval, and background synchronisation worker.
4. **How it communicates with the backend**: Connects to `ELASTICSEARCH_URL` via `@elastic/elasticsearch` Client (`syncTransaction`, `syncFinancialPlan`, `searchFinancialMemory`, `processRetryQueue`).
5. **What data it receives**: Transaction documents, financial plan documents, and user-scoped search queries.
6. **What data it returns**: Matched transaction IDs validated against MongoDB (`validatedAgainstMongoDB: true`), verified expense/income totals, matched plans, and audit records scoped strictly to `userId`.
7. **How its output affects UX**: Users can ask about past events like `"my last holiday"` and AURA expands semantic terms (`travel`, `holiday`, `vacation`, `flight`, `hotel`, `goa`), retrieves matching records, validates them against MongoDB (`₹31,400` across 3 Goa holiday transactions), and explains the exact total.
8. **What happens when unavailable**: If the Elasticsearch cluster is offline, updates are queued in `syncRetryQueue` with idempotent document IDs for background flushing, and search queries fall back to MongoDB's hybrid semantic/text query engine without losing availability.
9. **How the integration was tested**: Automated integration test #9 (`POST /api/elastic/search` verifying `₹31,400` travel total and family privacy isolation) and Postman Folder 13.
10. **Implementation files**: `server/src/integrations/elastic/index.ts`.

---

### 7. KERNEL — Controlled Browser Automation
1. **Role in AURA**: Powers **AURA Assisted Research** (`server/src/integrations/kernel/index.ts`).
2. **Why it is needed**: Provides optional, read-only browser research for publicly available product ownership benchmarks, warranty policies, and utility tariff schedules.
3. **Application feature using it**: **Smart Purchase Companion** ("Include KERNEL Assisted Research") and `POST /api/kernel/research`.
4. **How it communicates with the backend**: Backend calls `${KERNEL_API_URL}/browsers/research` with `KERNEL_API_KEY`, enforces a strict read-only session policy, and sanitises all text via `sanitizeUntrustedExternalText` before supplying it to Gemini or the frontend.
5. **What data it receives**: Public research topic and category (`product_specs`, `billing_tariff`, `warranty_policy`, `price_comparison`).
6. **What data it returns**: `KernelResearchResult` containing `browserAutomationExecuted`, `executionMode`, security assertions, and sanitised `structuredFindings`.
7. **How its output affects UX**: Enhances purchase evaluations with total-cost-of-ownership and warranty facts while blocking any request involving passwords, OTP/MFA, CAPTCHA bypass, or auto-pay checkout.
8. **What happens when unavailable**: When `KERNEL_API_KEY` is not configured, sets `browserAutomationExecuted: false` and `executionMode: 'labelled_offline_research_fallback'` with an explicit status notice.
9. **How the integration was tested**: Automated integration test #14 (verifying both allowed research and `400` blocking of credential/CAPTCHA bypass attempts) and Postman Folder 20.
10. **Implementation files**: `server/src/integrations/kernel/index.ts`, `client/src/pages/SmartPurchasePage.tsx`.

---

### 8. Postman — API Quality and Testing
1. **Role in AURA**: API contract documentation and automated quality assurance suite (`postman/AURA.postman_collection.json` and `postman/AURA.postman_environment.json`).
2. **Why it is needed**: Verifies all 20 API domains (Authentication, User profiles, Accounts, Transactions, CSV imports, Mandates, Financial plans, Goals, Family finance, Financial calendar, AI assistant, Purchase intelligence, Elastic search, Notifications, Payment preparation, PIN verification, PayPal orders, PayPal capture, PayPal webhooks, External integrations).
3. **Application feature using it**: Quality assurance and API contract verification across the entire backend.
4. **How it communicates with the backend**: Executes HTTP requests against `{{baseUrl}}` (`http://localhost:4000/api`) with environment variables and `pm.test(...)` assertions.
5. **What data it receives**: Environment variables (`baseUrl`, `authToken`, `paymentRequestId`, `paymentApprovalToken`, `paypalOrderId`, etc.).
6. **What data it returns**: Pass/fail test assertions for status codes, authentication enforcement, schema structure, and controlled payment execution.
7. **How its output affects UX**: Ensures every frontend workflow is backed by a tested, deterministic REST API.
8. **What happens when unavailable**: Postman is a development/QA artifact, not a runtime dependency.
9. **How the integration was tested**: Validated JSON schema and mirrored in `server/src/tests/runAllTests.ts`.
10. **Implementation files**: `postman/AURA.postman_collection.json`, `postman/AURA.postman_environment.json`.

---

### 9. Render — Deployment and Background Workflows
1. **Role in AURA**: Primary cloud hosting blueprint (`render.yaml`) and background workflow execution engine (`server/src/workers/backgroundWorkflows.ts` and `server/src/workers/runner.ts`).
2. **Why it is needed**: Hosts the static React frontend, the Node.js + Express + Python backend web service, and scheduled background jobs (daily upcoming commitment checks, post-CSV import pipeline, Elastic retry queue flushing, and post-PayPal webhook processing).
3. **Application feature using it**: Production deployment, `/api/health` readiness probes, CSV import post-processing, and **Automations** page (`POST /api/workers/run-daily`).
4. **How it communicates with the backend**: Runs scheduled jobs against MongoDB, Elasticsearch, Bryntum Calendar, and Zapier Automation Service.
5. **What data it receives**: User commitments, unsynced transactions, and calendar events.
6. **What data it returns**: Structured `WorkerJobRunSummary` (`jobName`, `status`, `startedAt`, `completedAt`, `details`).
7. **How its output affects UX**: Keeps calendar events, mandate reminders, and Elastic indices synchronised automatically in the background.
8. **What happens when unavailable**: Can be triggered on-demand from the UI (`Run Render Daily Commitment Job Now`) or via `npm run worker`.
9. **How the integration was tested**: Automated integration test #6 and #22 (`POST /api/workers/run-daily`).
10. **Implementation files**: `render.yaml`, `server/src/workers/backgroundWorkflows.ts`, `server/src/workers/runner.ts`.

---

### 10. Zapier — Financial Workflow Automation
1. **Role in AURA**: Powers the **AURA Automation Centre** (`server/src/integrations/zapier/index.ts` and `client/src/pages/AutomationsPage.tsx`).
2. **Why it is needed**: Connects AURA's internal financial events to user-authorised external channels (Email, Slack, Google Calendar, WhatsApp webhook via Zapier MCP) for 5 non-payment automations:
   - Automation 1: `upcoming_commitment_reminder`
   - Automation 2: `financial_milestone`
   - Automation 3: `monthly_financial_summary`
   - Automation 4: `payment_status_notification`
   - Automation 5: `financial_calendar_reminder`
3. **Application feature using it**: **Automations** page (`AutomationsPage.tsx`), Goal milestone contributions, PayPal capture receipts, and Calendar reminders.
4. **How it communicates with the backend**: `zapierIntegration.triggerAutomation` deduplicates reminders, records an in-app notification in MongoDB, strips sensitive account/PIN data, and dispatches a sanitised payload to `ZAPIER_WEBHOOK_URL` / `ZAPIER_MCP_URL`.
5. **What data it receives**: Event type, title, message, deduplication key, and user channel preferences.
6. **What data it returns**: `ZapierExecutionRecord` (`delivered_external` or `recorded_in_app_fallback`).
7. **How its output affects UX**: Users can enable, pause/revoke, or test any of the 5 automations and inspect the live execution log.
8. **What happens when unavailable**: When `ZAPIER_API_KEY` / `ZAPIER_WEBHOOK_URL` is not configured, AURA retains all notifications in-app (`NotificationModel`) and logs `recorded_in_app_fallback`.
9. **How the integration was tested**: Automated integration test #12, #20, and #22 (`GET /api/automations`).
10. **Implementation files**: `server/src/integrations/zapier/index.ts`, `client/src/pages/AutomationsPage.tsx`.
