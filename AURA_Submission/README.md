# AURA: Hackathon Submission Package
**PayPal + AI Hackathon 2026**

> *“Personal finance tools show you what happened. AURA helps you decide what happens next.”*

Welcome to the official submission package for **AURA (Autonomous Unified Resource Assistant)**. This package contains the comprehensive documentation, high-resolution architecture diagrams, production demo video scripts, recording checklists, and verified application screenshots for the PayPal + AI Hackathon judging panel.

---

## 📁 Package Contents & Directory Structure

```
AURA_Submission/
├── AURA_Project_Documentation.pdf    # 13-section comprehensive technical documentation
├── AURA_Architecture.png             # 6000x3900 high-resolution 5-layer system architecture diagram
├── AURA_Demo_Script.pdf              # 8-part professional 3–5 minute video recording script
├── AURA_Demo_Checklist.md            # Pre-recording setup checklist & contingency fallback guide
├── Screenshots/                      # 10 production application screenshots (1080p)
│   ├── 01_Dashboard.png              # Personal financial overview, net worth, and spending velocity
│   ├── 02_Ask_AURA.png               # Conversational AI assistant with tool-calling capabilities
│   ├── 03_Transactions.png           # PayPal transaction synchronization and category breakdowns
│   ├── 04_Financial_Goals.png        # Interactive savings goals with velocity and projection bars
│   ├── 05_Commitments.png            # Recurring subscriptions and cash flow debt commitments
│   ├── 06_Commerce.png               # Autonomous product discovery hub powered by Channel3
│   ├── 07_Product_Comparison.png     # Side-by-side spec comparison and financial impact badges
│   ├── 08_PayPal_Checkout.png        # Live PayPal Orders v2 Sandbox checkout integration
│   ├── 09_Merchant_Hub.png           # Bruce Wayne merchant analytics and order fulfillment workbench
│   └── 10_Purchase_Tracking.png      # Real-time order status and PayPal shipment tracking updates
└── README.md                         # Package index and evaluation guide (this document)
```

---

## 🔗 Live Application Links & Credentials

- **Live Frontend Application:** [https://aura-frontend-izl2.onrender.com](https://aura-frontend-izl2.onrender.com)
- **Live Backend API (REST/SSE):** [https://aura-backend-api-88nx.onrender.com/api](https://aura-backend-api-88nx.onrender.com/api)
- **GitHub Repository:** [https://github.com/AlanJ-2004/AURA](https://github.com/AlanJ-2004/AURA)

### Pre-Seeded Evaluation Personas

| Persona | Role | Email | Password | Intended Workflow |
| :--- | :--- | :--- | :--- | :--- |
| **Alex Sharma** | Consumer / Buyer | `alex@aura-demo.finance` | `AuraDemo#2026` | Test personal overview, Ask AURA assistant, financial goals, commitments, Channel3 product search, and PayPal Sandbox checkout. |
| **Bruce Wayne** | Merchant / Seller | `bruce_wayne@business.example.com` | `BruceBusiness#2026` | Test Merchant Hub, gross sales metrics, AG Grid transaction ledger, order fulfillment, and PayPal shipment tracking injection. |

---

## 🛠️ Technology Stack & Core Integrations

### 1. PayPal Developer Platform (Sandbox)
- **Orders v2 API (`/v2/checkout/orders`):** Dynamic order creation and capture with `intent: CAPTURE`, purchase units, and application context.
- **Identity & OAuth API (`/v1/oauth2/token`):** Automated token lifecycle management with memory caching and expiration skew buffers.
- **Transaction Reporting API (`/v1/reporting/transactions`):** Historical ledger synchronization across multi-month windows.
- **Webhooks API (`/api/webhooks/paypal`):** Asynchronous event routing for `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`.
- **Shipment Tracking API (`/v1/shipping/trackers-batch`):** Direct injection of carrier tracking numbers into PayPal's order ecosystem.

### 2. Artificial Intelligence Tier
- **Google Gemini 3.1 Flash-Lite:** Sub-second conversational orchestration, intent parsing, and deterministic tool-calling execution.
- **Gemini Embeddings (`gemini-embedding-2`):** Vector-based semantic search for product attributes and financial knowledge retrieval.
- **Astropods Agent Fleet (6 Autonomous Agents):**
  1. `financial-planner`: Budget modeling, goal simulation, debt payoff schedules.
  2. `investment-researcher`: Portfolio diversification and macroeconomic risk insights.
  3. `shopping-assistant`: Merchant catalog querying, coupon discovery, and price tracking.
  4. `merchant-assistant`: Inventory forecasting, checkout optimization, dispute mitigation.
  5. `developer-agent`: System telemetry, webhook verification, and sandbox health monitoring.
  6. `supervisor-agent`: Master orchestrator coordinating multi-step cross-agent plans.
- **Python Predictive ML Engine (FastAPI):** Time-series spending forecasting (ARIMA / exponential smoothing) and Isolation Forest anomaly detection for recurring subscriptions.

### 3. Frontend & Infrastructure
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, AG Grid Enterprise, Headless UI.
- **Backend:** Node.js, Express.js, Server-Sent Events (SSE), Python FastAPI.
- **Database:** MongoDB Atlas (M0 Multi-region Shard), ChromaDB vector store.

---

## 📸 Screenshot Index & Walkthrough

| Screenshot File | Description & Key Features Displayed |
| :--- | :--- |
| **`01_Dashboard.png`** | **Personal Financial Dashboard:** Displays net worth summary, liquid cash reserves ($4,250), monthly discretionary pacing, recent activity feed, and quick-action shortcuts. |
| **`02_Ask_AURA.png`** | **Ask AURA Conversational Co-Pilot:** Demonstrates Gemini 3.1 Flash-Lite tool calling, autonomous client-side navigation, and contextual financial reasoning with conversational memory. |
| **`03_Transactions.png`** | **Transactions Ledger:** Real-time ledger synchronized via PayPal's Transaction Reporting API, displaying category filters, merchant names, fee splits, and net amounts. |
| **`04_Financial_Goals.png`** | **Financial Goals Tracker:** Dynamic visual progress bars for active targets (Emergency Fund $3,200 / $5,000, Japan Trip $1,500 / $4,000) with calculated completion timelines. |
| **`05_Commitments.png`** | **Recurring Commitments & Bills:** Breakdown of fixed monthly obligations (Rent $1,800, Utilities, Subscriptions) and cash flow scheduling. |
| **`06_Commerce.png`** | **Smart Commerce Discovery Hub:** Channel3-powered product catalog querying real merchant electronics with live pricing, seller ratings, and instant impact indicators. |
| **`07_Product_Comparison.png`** | **Product Spec & Financial Impact View:** Direct side-by-side comparison of 3 laptops showing CPU/RAM specs alongside AURA's calculated goal delay badges (e.g. *Delays Emergency Fund by 12 days*). |
| **`08_PayPal_Checkout.png`** | **PayPal Orders v2 Sandbox Checkout:** User-in-the-loop authorization modal triggering live sandbox order capture with zero client-side credential exposure. |
| **`09_Merchant_Hub.png`** | **Bruce Wayne Merchant Hub:** Enterprise seller portal displaying gross sales ($12,450), active orders, AG Grid transaction workbench, and order fulfillment actions. |
| **`10_Purchase_Tracking.png`** | **Order Tracking & Shipment Updates:** End-to-end status tracker powered by PayPal's Shipment Tracking API showing tracking numbers and real-time delivery milestones. |

---

## 🎯 Verification & Integrity Statement

All deliverables in this repository reflect the actual, deployed application code. No endpoints, models, or capabilities have been simulated or fabricated. All PayPal operations execute against official PayPal Sandbox developer endpoints.

> *“Your money, your goals, your decisions. AURA is here to help you make them count.”*
