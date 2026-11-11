# APIMatic Context Plugin for AURA Developer Platform

The **AURA APIMatic Context Plugin** provides autonomous coding agents, LLMs, and platform engineers with structured metadata, API contracts, security policies, and AG Grid workspace workflows to build robust integrations on top of the AURA platform.

---

## 1. Plugin Metadata & Specifications

- **Plugin Configuration**: [`server/docs/apimatic-context-plugin.json`](file:///c:/Users/alanj/AURA/server/docs/apimatic-context-plugin.json)
- **Authoritative OpenAPI 3.0.3 Spec**: [`server/docs/openapi.json`](file:///c:/Users/alanj/AURA/server/docs/openapi.json)
- **Spec Validator**: `npm run openapi:validate` (runs `server/src/scripts/validateOpenApiContract.ts`)

---

## 2. Authentication & Authorization Architecture

AURA supports two authentication methods:

1. **Bearer JWT Token**:
   - Passed via `Authorization: Bearer <token>`.
   - Generated upon login via `POST /api/auth/login` or `POST /api/auth/demo-login`.
2. **Developer API Key**:
   - Passed via `X-AURA-API-KEY: <key>`.
   - Used for server-to-server workflows and automated test runners.

### Role Entitlements:
- **Personal Consumer**: Access to personal accounts, transactions, AI plans, financial goals, recurring commitments, and consumer ecommerce checkout. Access to Merchant Hub endpoints (`/api/ecommerce/merchant/*`) is strictly forbidden (HTTP 403).
- **Verified Business Merchant**: Exclusively granted to users whose connected PayPal account has been verified as a Business account. Unlocks fulfillment pipelines, order management, and received payment settlements.

---

## 3. AG Grid Natural-Language Data Exploration

AURA uniquely integrates AG Grid with natural-language AI conversational actions:

- **Saved Views**: `POST /api/grid/views` stores user-specific filter models, sort models, and column visibility.
- **Selection Context**: `POST /api/grid/selection-context` securely resolves ground-truth records and statistical summaries for selected row IDs.
- **AI Tool Actions**:
  - `grid_apply_filters`: Programmatically applies column filters based on user request.
  - `grid_apply_sorting`: Sorts grid columns in ascending/descending order.
  - `grid_clear_filters`: Resets grid filters back to baseline.
  - `grid_undo_action`: Restores preceding grid state.
  - `grid_analyse_selection`: Produces structured analysis on user-selected records.

---

## 4. APIMatic PayPal Contract Guard

AURA development intelligence enforces official PayPal Orders API v2, OAuth 2.0, and Webhook schemas through `ApimaticPayPalContractValidator`.
- Blocks deprecated v1 endpoints (`/v1/payments/payment`).
- Enforces strict string-decimal amounts matching currency ISO-4217 specifications.
- Validates idempotency headers (`PayPal-Request-Id`) on financial state changes.
