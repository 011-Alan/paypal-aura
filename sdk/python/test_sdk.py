import sys
import time
from aura_sdk import AuraClient, AuraAuthorizationError

def run_python_suite():
    print("========================================================")
    print("      AURA PYTHON SDK VERIFICATION TEST SUITE           ")
    print("========================================================")

    client = AuraClient(base_url="http://localhost:5000")
    passed = 0
    total = 0

    def test(name: str, fn):
        nonlocal passed, total
        total += 1
        try:
            fn()
            print(f" [✓] Test {total}: {name}")
            passed += 1
        except Exception as ex:
            print(f" [✗] Test {total}: {name} FAILED -> {ex}")

    # 1. Demo Login
    def test_demo_login():
        res = client.demo_login("alex")
        if not res.get("token") or res.get("user", {}).get("email") != "alex@example.com":
            raise Exception(f"Unexpected login response: {res}")
    test("Authenticate as Consumer Persona (Alex Morgan)", test_demo_login)

    # 2. List Accounts
    def test_list_accounts():
        res = client.list_accounts()
        if not isinstance(res.get("accounts"), list) or len(res["accounts"]) == 0:
            raise Exception("No accounts returned")
    test("Retrieve Linked Accounts & Balances", test_list_accounts)

    # 3. List Transactions
    sample_ids = []
    def test_list_transactions():
        nonlocal sample_ids
        res = client.list_transactions(limit=10)
        rows = res.get("agGrid", {}).get("rows") or res.get("transactions", [])
        if not rows:
            raise Exception("No transactions returned")
        sample_ids = [r["id"] for r in rows[:3]]
    test("Fetch Transactions in AG Grid Table Format", test_list_transactions)

    # 4. Save AG Grid View
    view_name = f"PySDK_View_{int(time.time())}"
    def test_save_grid_view():
        res = client.save_grid_view(
            grid_id="transactions-grid",
            name=view_name,
            filter_model={"amount": {"filterType": "number", "type": "greaterThan", "filter": 75}},
            sort_model=[{"colId": "amount", "sort": "desc"}],
            column_visibility={"date": True, "merchant": True, "amount": True}
        )
        if not res.get("success"):
            raise Exception("Failed to save view")
    test("Save AG Grid View Configuration", test_save_grid_view)

    # 5. Retrieve Saved Views
    def test_get_saved_views():
        res = client.get_grid_views("transactions-grid")
        views = res.get("views", [])
        if not any(v.get("name") == view_name for v in views):
            raise Exception(f"Saved view '{view_name}' not found")
    test("Retrieve User AG Grid Views for transactions-grid", test_get_saved_views)

    # 6. Resolve Grid Selection Context
    def test_resolve_grid_selection():
        if not sample_ids:
            raise Exception("No sample IDs to test")
        res = client.resolve_grid_selection("transactions", "transactions-grid", sample_ids)
        if not res.get("success") or res.get("context", {}).get("totalSelected") != len(sample_ids):
            raise Exception(f"Selection resolution failed: {res}")
        if "totalAmount" not in res.get("context", {}).get("summary", {}):
            raise Exception("Missing totalAmount in selection summary")
    test("Resolve Authoritative Ground-Truth Grid Selection Context", test_resolve_grid_selection)

    # 7. Ask AURA with Selection Context
    def test_ask_aura():
        res = client.ask_aura(
            prompt="Analyze these transactions for unusual spending spikes.",
            grid_selection_context={
                "source": "transactions",
                "gridId": "transactions-grid",
                "selectedIds": sample_ids,
                "selectionMode": "explicit"
            }
        )
        if not res.get("success") or not res.get("response"):
            raise Exception("Ask AURA did not return a valid response")
    test("Ask AURA Natural-Language Analysis on Attached Selection", test_ask_aura)

    # 8. Security Isolation Test
    def test_security_isolation():
        try:
            client.get_merchant_overview()
            raise Exception("Expected 403 Forbidden but call succeeded!")
        except AuraAuthorizationError:
            # Expected!
            pass
    test("Security: Personal User Forbidden from Merchant Operations (HTTP 403)", test_security_isolation)

    # 9. Merchant Access for Bruce Wayne
    def test_merchant_access():
        merchant_client = AuraClient(base_url="http://localhost:5000")
        merchant_client.demo_login("bruce")
        res = merchant_client.get_merchant_overview()
        if not res.get("success") or "overview" not in res:
            raise Exception(f"Merchant overview failed for Bruce: {res}")
    test("Merchant Hub: Bruce Wayne (PayPal Business) Authorized Access", test_merchant_access)

    print("--------------------------------------------------------")
    print(f"Python SDK Suite Results: {passed}/{total} Tests Passed")
    print("========================================================\n")

    if passed != total:
        sys.exit(1)

if __name__ == "__main__":
    run_python_suite()
