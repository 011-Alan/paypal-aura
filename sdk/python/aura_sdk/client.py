import json
import urllib.request
import urllib.error
import urllib.parse
import time
from typing import Optional, Dict, Any, List

from .models import (
    User,
    Account,
    Transaction,
    FinancialPlan,
    Goal,
    Mandate,
    GridSavedView,
    SelectionContextResult,
    SelectionSummary,
    AiAskResponse,
)
from .exceptions import (
    AuraError,
    AuraAuthenticationError,
    AuraAuthorizationError,
    AuraNotFoundError,
    AuraRateLimitError,
)

class AuraClient:
    def __init__(self, base_url: str = "http://localhost:5000", token: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.api_key = api_key

    def set_token(self, token: str):
        self.token = token

    def set_api_key(self, api_key: str):
        self.api_key = api_key

    def _request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path if path.startswith('/') else '/' + path}"
        if params:
            qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            if qs:
                url = f"{url}?{qs}"

        body = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")

        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        if self.api_key:
            req.add_header("X-AURA-API-KEY", self.api_key)

        try:
            with urllib.request.urlopen(req) as resp:
                resp_body = resp.read().decode("utf-8")
                return json.loads(resp_body) if resp_body else {}
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8")
            parsed_err = {}
            try:
                parsed_err = json.loads(err_body)
            except Exception:
                pass

            msg = parsed_err.get("error") or err.reason or f"HTTP {err.code}"
            if err.code == 401:
                raise AuraAuthenticationError(msg, parsed_err)
            elif err.code == 403:
                raise AuraAuthorizationError(msg, parsed_err)
            elif err.code == 404:
                raise AuraNotFoundError(msg, parsed_err)
            elif err.code == 429:
                raise AuraRateLimitError(msg, parsed_err)
            else:
                raise AuraError(msg, status_code=err.code, details=parsed_err)
        except Exception as ex:
            raise AuraError(str(ex))

    # --- Authentication ---
    def demo_login(self, persona: str = "alex") -> Dict[str, Any]:
        res = self._request("POST", "/api/auth/demo-login", data={"persona": persona})
        if "token" in res:
            self.set_token(res["token"])
        return res

    def login(self, email: str, password: str) -> Dict[str, Any]:
        res = self._request("POST", "/api/auth/login", data={"email": email, "password": password})
        if "token" in res:
            self.set_token(res["token"])
        return res

    def get_session(self) -> Dict[str, Any]:
        return self._request("GET", "/api/auth/session")

    # --- Accounts ---
    def list_accounts(self) -> Dict[str, Any]:
        return self._request("GET", "/api/accounts")

    # --- Transactions ---
    def list_transactions(self, category: Optional[str] = None, tx_type: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
        return self._request("GET", "/api/transactions", params={"category": category, "type": tx_type, "limit": limit})

    # --- Plans ---
    def get_active_plan(self) -> Dict[str, Any]:
        return self._request("GET", "/api/plans")

    def generate_plan(self) -> Dict[str, Any]:
        return self._request("POST", "/api/plans/generate", data={})

    # --- Mandates ---
    def list_mandates(self) -> Dict[str, Any]:
        return self._request("GET", "/api/mandates")

    # --- Goals ---
    def list_goals(self) -> Dict[str, Any]:
        return self._request("GET", "/api/goals")

    # --- Merchant Hub ---
    def get_merchant_overview(self) -> Dict[str, Any]:
        return self._request("GET", "/api/ecommerce/merchant/overview")

    def list_merchant_orders(self) -> Dict[str, Any]:
        return self._request("GET", "/api/ecommerce/merchant/orders")

    # --- AG Grid Workspace ---
    def get_grid_views(self, grid_id: str) -> Dict[str, Any]:
        return self._request("GET", "/api/grid/views", params={"gridId": grid_id})

    def save_grid_view(self, grid_id: str, name: str, filter_model: Optional[Dict[str, Any]] = None, sort_model: Optional[List[Dict[str, Any]]] = None, column_visibility: Optional[Dict[str, bool]] = None) -> Dict[str, Any]:
        data = {
            "gridId": grid_id,
            "name": name,
            "filterModel": filter_model or {},
            "sortModel": sort_model or [],
            "columnVisibility": column_visibility or {},
        }
        return self._request("POST", "/api/grid/views", data=data)

    def delete_grid_view(self, view_id: str) -> Dict[str, Any]:
        return self._request("DELETE", f"/api/grid/views/{view_id}")

    def resolve_grid_selection(self, source: str, grid_id: str, selected_ids: List[str]) -> Dict[str, Any]:
        data = {
            "source": source,
            "gridId": grid_id,
            "selectedIds": selected_ids,
            "selectionMode": "explicit",
        }
        return self._request("POST", "/api/grid/selection-context", data=data)

    # --- Ask AURA AI ---
    def ask_aura(self, prompt: str, grid_selection_context: Optional[Dict[str, Any]] = None, conversation_id: Optional[str] = None) -> Dict[str, Any]:
        data = {
            "prompt": prompt,
            "conversationId": conversation_id,
            "gridSelectionContext": grid_selection_context,
        }
        return self._request("POST", "/api/ai/ask", data=data)
