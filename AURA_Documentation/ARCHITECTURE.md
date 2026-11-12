# AURA: System Architecture & Technical Engineering Specification

> **Autonomous Unified Resource Assistant (AURA)**  
> *Architectural Blueprint, State Machines, Data Models & Integration Protocols*

---

## 1. Architectural Philosophy & Core Principles

AURA is engineered around three non-negotiable architectural axioms:

1. **Deterministic Financial Safety:** Non-deterministic large language models (LLMs) must **never** execute financial mutations or disburse funds directly. AI agents may discover products, analyze liquidity, forecast goal delays, and prepare transaction structures—but execution requires an immutable **user-in-the-loop** authorization boundary backed by Argon2id PIN verification and cryptographic approval tokens.
2. **Authoritative Transactional Truth:** MongoDB Atlas is the sole authoritative state of truth for account balances, transaction records, recurring commitments, and order states. External search indexes (Elasticsearch) and client-side grids (AG Grid) are derived consumers that reflect validated backend states.
3. **Resilient Graceful Degradation:** Every external sponsor service and API integration (PayPal Sandbox, Google Gemini, Channel3, Astropods, Elastic, KERNEL, Zapier) incorporates deterministic local fallbacks, in-memory caches, or offline reference models to ensure 100% platform availability even during upstream API degradation.

---

## 2. High-Level 5-Tier Architecture

The platform is organized into five decoupled tiers:

```mermaid
flowchart TD
    subgraph Tier1["1. Client Tier (React 18 + Vite)"]
        UI_Shell["AppShell & Dynamic Navigation"]
        UI_Dash["Financial Dashboards & AG Grid"]
        UI_Store["E-Commerce Storefront & Cart"]
        UI_Merchant["Merchant Hub & Order Workbench"]
        UI_Chat["Ask AURA Floating Companion"]
    end

    subgraph Tier2["2. Orchestration & API Gateway Tier (Node.js / Express)"]
        GW_Router["Express API Gateway (/api)"]
        GW_Auth["Argon2id Auth & JWT Session Guard"]
        GW_Guardian["Payment Guardian & PIN Gate"]
        GW_Nav["Application Route Registry"]
        GW_Worker["Render Background Worker & Queue"]
    end

    subgraph Tier3["3. Agent Fleet Tier (Astropods Cloud & Local)"]
        Agent_Super["Gemini Multi-Agent Orchestrator"]
        Agent_Plan["AURA Financial Planner"]
        Agent_Tx["AURA Transaction Intelligence"]
        Agent_Mandate["AURA Mandate Intelligence"]
        Agent_Rec["AURA Financial Recovery"]
        Agent_Purch["AURA Purchase Intelligence"]
        Agent_Guard["AURA Financial Guardian"]
    end

    subgraph Tier4["4. AI & Analytics Engine Tier"]
        AI_Gemini["Google Gemini 3.1 Flash-Lite (Tool Calling)"]
        AI_Embed["Gemini Embedding 2 (Vector Retrieval)"]
        ML_Python["Python Analytics Engine (Pandas, NumPy, Scikit-Learn)"]
    end

    subgraph Tier5["5. Persistence & External Services Tier"]
        DB_Mongo[("MongoDB Atlas Primary Store")]
        DB_Elastic[("Elasticsearch Financial Memory")]
        EXT_PayPal["PayPal Sandbox API (Orders v2, Identity, Reporting, Tracking)"]
        EXT_Channel3["Channel3 Commerce Discovery API"]
        EXT_Zapier["Zapier MCP Webhook Gateway"]
    end

    %% Cross-Tier Connections
    Tier1 <-->|HTTPS / REST & JSON Payloads| Tier2
    Tier2 <-->|Task RPC & Event Bus| Tier3
    Tier2 <-->|Model Prompts & Tool Contracts| Tier4
    Tier2 <-->|Mongoose ODM & REST SDKs| Tier5
    Tier3 <-->|Analytical Tasks| ML_Python
    Tier3 <-->|Inference & Function Calling| AI_Gemini
```

---

## 3. Detailed Tier Specifications

### 3.1 Client Tier (Presentation & Interaction)
* **Framework:** React 18.3.1 with TypeScript 5.6, bundled via Vite 5.4.
* **Styling & Theming:** Tailwind CSS 3.4 with unified Dark/Light mode tokens and persistent `localStorage` preference tracking.
* **Data Grids:** AG Grid Community v32.3 integrated with custom cell renderers for status badges, category filters, and currency formatting.
* **Data Visualization:** Recharts for cash flow projections, monthly category pacing, and goal milestone timelines.
* **State & Communication:** React Context providers (`AuthContext`, `AskAuraContext`) managing token persistence, real-time client-side navigation (`navigate_to_page` action dispatching), and active order tracking drawers.

### 3.2 Orchestration & API Gateway Tier
* **Runtime:** Node.js 20+ with Express 4.21 and TypeScript (`tsx` runtime in development).
* **Security Middleware:** 
  * `helmet` for secure HTTP headers.
  * `cors` with origin whitelisting (`CLIENT_ORIGIN` and Onrender hosts).
  * `express-rate-limit` enforcing strict rate limiting on authentication and AI endpoints.
  * `argon2` implementing Argon2id password hashing and payment PIN verification.
  * `jsonwebtoken` issuing HMAC-SHA256 session tokens with 24-hour expiration.
* **Worker Service:** In-process durable background scheduler executing daily commitment evaluations, bill reminders, and retry queues.

### 3.3 Agent Fleet Tier (Astropods Framework)
AURA partitions complex financial operations into six specialized micro-agents:
1. **`financial-planner`:** Computes 50/30/20 budget allocations, savings rates, and emergency fund runway.
2. **`transaction-intelligence`:** Analyzes spending velocity, flags statistical anomalies, and categorizes transaction streams.
3. **`mandate-intelligence`:** Infers recurring bills, monitors subscription price changes, and prevents duplicate memberships.
4. **`financial-recovery`:** Detects budget overruns and formulates non-judgmental expense adjustments to protect essential obligations.
5. **`purchase-intelligence`:** Evaluates product affordability against liquid balances and calculates days delayed for active savings goals.
6. **`financial-guardian`:** Enforces hard financial policies (daily limits, single-transaction caps) and gates payment preparation. **Invariant:** `canExecutePayments: false`.

### 3.4 AI & Analytics Engine Tier
* **Google Gemini 3.1 Flash-Lite:** Primary conversational and tool-dispatching LLM. Generates function-call arguments formatted against Zod schemas.
* **Google Gemini Embedding 2:** Semantic vector generation for product catalog matching and conversational context retrieval.
* **Python Analytics Microservice (`analytics_engine.py`):**
  * Invoked via Node.js `child_process.spawn` over an asynchronous JSON stdin/stdout pipe.
  * Implements `scikit-learn` IsolationForest for transaction anomaly detection.
  * Computes exponential moving average cash flow forecasts and discretionary budget ceilings.
  * Execution timeout: 1,500ms with instantaneous fallback to deterministic TypeScript mathematics.

### 3.5 Persistence & External Services Tier
* **MongoDB Atlas:** Multi-region cluster maintaining 18 relational document collections.
* **PayPal Sandbox REST Ecosystem:**
  * Orders v2 (`POST /v2/checkout/orders`, `POST /v2/checkout/orders/{id}/capture`).
  * Identity API (`POST /v1/oauth2/token`, `GET /v1/identity/openidconnect/userinfo`).
  * Reporting API (`GET /v1/reporting/transactions`, `GET /v1/reporting/balances`).
  * Webhook Receiver (`POST /api/webhooks/paypal`).
  * Shipment Tracking API (`POST /v1/shipping/trackers-batch`).
* **Channel3 API:** Live e-commerce querying, seller ratings, multi-merchant offer extraction, and stock status tracking.

---

## 4. Key Execution Workflows & State Machines

### 4.1 Payment Creation, Verification & Capture State Machine

```mermaid
sequenceDiagram
    autonumber
    actor User as Consumer (Alex)
    participant Client as React Client
    participant GW as API Gateway
    participant Guard as Financial Guardian
    participant PayPal as PayPal Sandbox API
    participant DB as MongoDB Atlas

    User->>Client: Clicks "Proceed with PayPal" ($899.00)
    Client->>GW: POST /api/payments/prepare
    GW->>Guard: Evaluate Financial Policy (Cap, Limits, Discretionary Balance)
    Guard-->>GW: Policy Passed (Requires PIN Verification)
    GW-->>Client: Challenge: Enter 4-Digit Security PIN

    User->>Client: Submits PIN (e.g., "4826")
    Client->>GW: POST /api/payments/verify-pin { pin, requestId }
    GW->>GW: Argon2id Verify PIN vs User Record
    GW->>GW: Issue Cryptographic Approval Token (TTL: 300s)
    GW-->>Client: { approvalToken }

    Client->>GW: POST /api/payments/create-order { approvalToken, itemId }
    GW->>PayPal: POST /v2/checkout/orders (intent: CAPTURE, idempotency header)
    PayPal-->>GW: { orderId: "8XY...", approveUrl }
    GW-->>Client: Launch PayPal Sandbox Modal

    User->>PayPal: Authenticates in Sandbox & Approves Order
    PayPal-->>Client: onApprove callback { orderId }

    Client->>GW: POST /api/payments/capture-order { orderId }
    GW->>PayPal: POST /v2/checkout/orders/8XY.../capture
    PayPal-->>GW: { status: "COMPLETED", captureId: "4AB..." }
    GW->>DB: Store Transaction, Deduct Liquid Balance, Record AuditLog
    GW-->>Client: Order Confirmed & Receipt Rendered
```

### 4.2 Ask AURA Autonomous Tool Execution Pipeline

```mermaid
flowchart LR
    A["User Prompt\n'Take me to payments'"] --> B["API Gateway\n/api/chat/message"]
    B --> C["Gemini 3.1 Flash-Lite\nTool Calling"]
    C --> D{"Tool Decision"}
    
    D -->|Tool: navigate_to_page| E["Action Registry\nValidates Route: /payments"]
    D -->|Tool: search_products| F["Channel3 API\nFetch Inventory"]
    D -->|Tool: analyse_spending| G["Python Analytics\nCompute Runways"]
    
    E --> H["Tool Action Payload\n{ type: 'navigation', target: '/payments' }"]
    F --> H
    G --> H
    
    H --> I["Client Action Dispatcher\n(window.dispatchEvent)"]
    I --> J["React Router\nImmediate Route Transition"]
    I --> K["Preserve Chat History\n& Context Window"]
```

---

## 5. Database Schema & Entity Relationships

```mermaid
erDiagram
    User ||--o{ Account : owns
    User ||--o{ Transaction : executes
    User ||--o{ Mandate : commits_to
    User ||--o{ Goal : tracks
    User ||--o{ EcommerceOrder : places
    User ||--o{ Conversation : engages_in
    User ||--o{ PaymentRequest : authorizes
    User ||--o| FamilyGroup : belongs_to

    EcommerceOrder ||--|{ EcommerceOrderItem : contains
    Conversation ||--o{ Message : contains

    User {
        string email PK
        string passwordHash
        string pinHash
        string role
        string accountType
        string auraAccountType
        string paypalAccountType
        boolean merchantAccessEnabled
        string paypalMerchantId
        number monthlyIncome
    }

    Account {
        string userId FK
        string accountType
        string institutionName
        number balance
        string currency
        string paypalAccountId
    }

    Transaction {
        string userId FK
        string accountId FK
        number amount
        string category
        string description
        string paypalTransactionId
        string status
        boolean isAnomalous
    }

    Mandate {
        string userId FK
        string title
        number amount
        string frequency
        number dueDay
        boolean autoPay
    }

    Goal {
        string userId FK
        string title
        number targetAmount
        number currentAmount
        date targetDate
    }

    EcommerceOrder {
        string orderNumber PK
        string buyerUserId FK
        string merchantUserId FK
        number totalAmount
        string status
        string paypalOrderId
        string paypalCaptureId
        string trackingNumber
        string carrier
    }
```

---

## 6. Security Architecture & Boundary Controls

1. **Authentication:** Argon2id hash parameters configured with time cost = 3, memory cost = 65,536 KiB, and parallelism = 4.
2. **Payment Authorization Gate:**
   * Step 1: Pre-flight financial policy verification (`PaymentGuardianService`).
   * Step 2: In-band user PIN verification returning a signed JWT approval token with 300-second TTL.
   * Step 3: Orders v2 creation executed server-side using authorized PayPal client credentials.
3. **Idempotency Protection:** Every order creation and capture sends a unique `PayPal-Request-Id` header (UUIDv4) preventing duplicate debit charges under network replay scenarios.
4. **Data Isolation:** Every MongoDB query enforces strict `{ userId: req.user.id }` scope constraints, preventing cross-tenant data access. Family group members share only household-tagged budgets while individual account numbers and transactions remain private.
5. **Webhook Integrity:** Inbound PayPal webhooks are validated using PayPal's public key transmission certificates via `/v1/notifications/verify-webhook-signature` before triggering order fulfillment.

---

## 7. Resilience & Graceful Degradation

| Subsystem | Primary Integration | Failure Scenario | Fallback Mechanism |
| :--- | :--- | :--- | :--- |
| **Conversational AI** | Google Gemini 3.1 Flash-Lite | API rate limit / 429 quota exhaustion | Fallback to heuristic intent parser + cached responses |
| **Product Discovery** | Channel3 Commerce API | Network timeout / invalid API key | Curated verified reference catalog with realistic pricing |
| **Transaction Analytics** | Python ML (`analytics_engine.py`) | Python runtime missing / execution timeout | Instantaneous TypeScript statistical algorithm fallback |
| **Multi-Agent Fleet** | Astropods Cloud Deployments | Container offline / adapter unreachable | Local TypeScript agent logic executed within Node.js process |
| **Search & Indexing** | Elasticsearch Cluster | Cluster unreachable / connection refused | Direct MongoDB regex queries + persistent sync retry queue |
| **Payment Execution** | PayPal Sandbox API | Sandbox platform latency | Exponential backoff retry with idempotent transaction keys |

---
*Document Version: 2.1.0 | AURA Technical Engineering Documentation*
