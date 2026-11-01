#!/usr/bin/env python3
"""
PROJECT AURA — Python Financial Analytics, Anomaly Detection & Allocation Engine
Powered by Pandas, NumPy, and Scikit-Learn.
Reads a JSON payload from stdin and writes a structured JSON analysis to stdout.
"""

import sys
import json
import math
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

warnings.filterwarnings("ignore")


def safe_float(val, default=0.0):
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else round(v, 2)
    except Exception:
        return default


def analyze_transactions(payload: dict) -> dict:
    transactions = payload.get("transactions", [])
    monthly_income = safe_float(payload.get("monthlyIncome", 95000.0), 95000.0)

    if not transactions:
        return {
            "engine": "python-pandas-sklearn",
            "totalIncome": 0.0,
            "totalExpense": 0.0,
            "netCashflow": 0.0,
            "savingsRatePercent": 0.0,
            "categoryBreakdown": [],
            "monthlyTrends": [],
            "unusualTransactions": [],
            "forecastNextMonthExpense": 0.0,
            "forecastConfidence": 0.85,
        }

    df = pd.DataFrame(transactions)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["month"] = df["date"].dt.strftime("%Y-%m").fillna("2026-11")

    income_df = df[df["type"] == "income"]
    expense_df = df[df["type"] == "expense"].copy()

    total_income = safe_float(income_df["amount"].sum())
    if total_income <= 0:
        total_income = monthly_income
    total_expense = safe_float(expense_df["amount"].sum())
    net_cashflow = safe_float(total_income - total_expense)
    savings_rate = safe_float((max(0.0, net_cashflow) / total_income) * 100.0) if total_income > 0 else 0.0

    # Category breakdown using Pandas groupby
    category_breakdown = []
    if not expense_df.empty:
        cat_grp = (
            expense_df.groupby("category", as_index=False)
            .agg(
                totalAmount=("amount", "sum"),
                transactionCount=("amount", "count"),
                averageAmount=("amount", "mean"),
                maxAmount=("amount", "max"),
            )
            .sort_values(by="totalAmount", ascending=False)
        )
        for _, row in cat_grp.iterrows():
            share = (row["totalAmount"] / total_expense * 100.0) if total_expense > 0 else 0.0
            category_breakdown.append(
                {
                    "category": str(row["category"]),
                    "totalAmount": safe_float(row["totalAmount"]),
                    "transactionCount": int(row["transactionCount"]),
                    "averageAmount": safe_float(row["averageAmount"]),
                    "maxAmount": safe_float(row["maxAmount"]),
                    "sharePercent": safe_float(share),
                }
            )

    # Monthly trends
    monthly_trends = []
    months = sorted(df["month"].dropna().unique())
    for m in months:
        m_df = df[df["month"] == m]
        m_inc = safe_float(m_df[m_df["type"] == "income"]["amount"].sum())
        m_exp = safe_float(m_df[m_df["type"] == "expense"]["amount"].sum())
        monthly_trends.append(
            {
                "month": str(m),
                "income": m_inc,
                "expense": m_exp,
                "savings": safe_float(m_inc - m_exp),
            }
        )

    # Anomaly / Unusual Transaction Detection using Scikit-Learn IsolationForest + Category Z-score
    unusual_transactions = []
    if len(expense_df) >= 4:
        cat_stats = expense_df.groupby("category")["amount"].agg(["mean", "std"]).reset_index()
        expense_df = expense_df.merge(cat_stats, on="category", how="left")
        expense_df["std"] = expense_df["std"].fillna(1.0).replace(0.0, 1.0)
        expense_df["z_score"] = (expense_df["amount"] - expense_df["mean"]) / expense_df["std"]

        features = expense_df[["amount", "z_score"]].fillna(0.0).values
        iso = IsolationForest(contamination=0.15, random_state=42)
        preds = iso.fit_predict(features)
        scores = -iso.score_samples(features)
        expense_df["iso_pred"] = preds
        expense_df["anomaly_score"] = scores

        for _, row in expense_df.iterrows():
            is_flagged = bool(row.get("isUnusual", False)) or (row["z_score"] > 1.65) or (
                row["iso_pred"] == -1 and row["amount"] > row["mean"] * 1.35
            )
            if is_flagged:
                ratio = safe_float(row["amount"] / max(1.0, row["mean"]))
                reason = row.get("unusualReason") or (
                    f"Spend of INR {safe_float(row['amount'])} in {row['category']} is {ratio}x higher than category average (INR {safe_float(row['mean'])})."
                )
                unusual_transactions.append(
                    {
                        "id": str(row.get("_id") or row.get("id") or ""),
                        "merchant": str(row.get("merchant", "")),
                        "category": str(row.get("category", "")),
                        "amount": safe_float(row["amount"]),
                        "date": str(row["date"].isoformat() if pd.notna(row["date"]) else ""),
                        "anomalyScore": safe_float(row["anomaly_score"]),
                        "zScore": safe_float(row["z_score"]),
                        "reason": str(reason),
                    }
                )

    # Expense Forecasting using Scikit-Learn LinearRegression on monthly expenses
    forecast_next_month = total_expense
    if len(monthly_trends) >= 2:
        X = np.arange(len(monthly_trends)).reshape(-1, 1)
        y = np.array([m["expense"] for m in monthly_trends], dtype=float)
        model = LinearRegression()
        model.fit(X, y)
        next_x = np.array([[len(monthly_trends)]])
        pred = float(model.predict(next_x)[0])
        forecast_next_month = safe_float(max(pred, np.mean(y) * 0.75))
    elif len(monthly_trends) == 1:
        forecast_next_month = safe_float(monthly_trends[0]["expense"])

    return {
        "engine": "python-pandas-sklearn",
        "totalIncome": total_income,
        "totalExpense": total_expense,
        "netCashflow": net_cashflow,
        "savingsRatePercent": savings_rate,
        "categoryBreakdown": category_breakdown,
        "monthlyTrends": monthly_trends,
        "unusualTransactions": unusual_transactions,
        "forecastNextMonthExpense": forecast_next_month,
        "forecastConfidence": 0.89,
    }


def calculate_plan_allocations(payload: dict) -> dict:
    monthly_income = safe_float(payload.get("monthlyIncome", 95000.0), 95000.0)
    mandates = payload.get("mandates", [])
    transactions = payload.get("transactions", [])
    goals = payload.get("goals", [])
    savings_target_pct = safe_float(payload.get("savingsTargetPercent", 20.0), 20.0)

    # Sum confirmed monthly commitments (excluding salary inflow)
    commitment_mandates = [
        m for m in mandates if m.get("category") != "Salary" and m.get("status") in ("confirmed", "inferred")
    ]
    total_commitments = safe_float(sum(safe_float(m.get("amount", 0.0)) for m in commitment_mandates))

    # Calculate current month spent by category using Pandas
    spent_by_cat = {}
    if transactions:
        df = pd.DataFrame(transactions)
        exp_df = df[df["type"] == "expense"]
        if not exp_df.empty:
            exp_df["amount"] = pd.to_numeric(exp_df["amount"], errors="coerce").fillna(0.0)
            spent_by_cat = exp_df.groupby("category")["amount"].sum().to_dict()

    # Goal monthly contributions
    goal_savings = safe_float(sum(safe_float(g.get("monthlyContribution", 0.0)) for g in goals if g.get("status") == "active"))
    desired_savings = max(goal_savings, safe_float(monthly_income * (savings_target_pct / 100.0)))

    # Remaining pool for essential non-mandate + discretionary
    remaining_after_commitments_and_savings = max(0.0, monthly_income - total_commitments - desired_savings)
    essential_budget = safe_float(remaining_after_commitments_and_savings * 0.55)
    discretionary_budget = safe_float(remaining_after_commitments_and_savings * 0.45)

    # Construct structured category allocations
    raw_categories = [
        ("Housing & Rent", "commitment", max(8000.0, safe_float(spent_by_cat.get("Housing", 0.0) or spent_by_cat.get("Rent", 8000.0))), ["Housing", "Rent"]),
        ("Bills, Insurance & Internet", "commitment", max(3200.0, total_commitments - 8000.0), ["Insurance", "Internet", "Electricity", "Subscription", "Loan EMI", "Education"]),
        ("Groceries & Household", "essential", max(10000.0, safe_float(essential_budget * 0.55)), ["Groceries", "Household"]),
        ("Transport & Healthcare", "essential", max(6000.0, safe_float(essential_budget * 0.45)), ["Transport", "Healthcare", "Fuel"]),
        ("Dining & Lifestyle", "discretionary", max(7500.0, safe_float(discretionary_budget * 0.42)), ["Dining", "Food & Dining", "Entertainment"]),
        ("Shopping & Electronics", "discretionary", max(10500.0, safe_float(discretionary_budget * 0.58)), ["Shopping", "Electronics", "Travel"]),
        ("Goals & Emergency Savings", "savings", desired_savings, ["Savings", "Investment"]),
    ]

    allocations = []
    recovery_recommendations = []

    for idx, (cat_label, alloc_type, planned, match_keys) in enumerate(raw_categories):
        spent = safe_float(sum(safe_float(spent_by_cat.get(k, 0.0)) for k in match_keys))
        remaining = safe_float(planned - spent)
        utilization = safe_float((spent / planned) * 100.0) if planned > 0 else 0.0
        status = "on_track"
        rec_text = "Allocation is well-balanced within your monthly plan."
        if utilization > 100.0:
            status = "overrun"
            overrun = safe_float(spent - planned)
            rec_text = f"Exceeded planned budget by INR {overrun}. Consider rebalancing discretionary spend."
            recovery_recommendations.append(
                {
                    "id": f"rec-{idx + 1}",
                    "category": cat_label,
                    "overrunAmount": overrun,
                    "action": f"Reallocate INR {overrun} from flexible lifestyle buffer and pause non-essential {cat_label} purchases for 14 days.",
                    "projectedSavings": overrun,
                    "status": "proposed",
                }
            )
        elif utilization >= 80.0:
            status = "warning"
            rec_text = f"At {utilization}% utilization; INR {max(0.0, remaining)} remaining for the month."

        allocations.append(
            {
                "category": cat_label,
                "type": alloc_type,
                "plannedAmount": planned,
                "spentAmount": spent,
                "remainingAmount": remaining,
                "utilizationPercent": utilization,
                "status": status,
                "recommendation": rec_text,
            }
        )

    unallocated_buffer = safe_float(
        max(0.0, monthly_income - (total_commitments + essential_budget + discretionary_budget + desired_savings))
    )

    return {
        "engine": "python-pandas-sklearn",
        "totalIncome": monthly_income,
        "totalCommitments": total_commitments,
        "totalEssentialBudget": essential_budget,
        "totalDiscretionaryBudget": discretionary_budget,
        "totalSavingsTarget": desired_savings,
        "unallocatedBuffer": unallocated_buffer,
        "allocations": allocations,
        "recoveryRecommendations": recovery_recommendations,
    }


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"error": "Empty input"}))
            return
        payload = json.loads(raw_input)
        task = payload.get("task", "analyze_transactions")
        if task == "calculate_plan":
            result = calculate_plan_allocations(payload)
        else:
            result = analyze_transactions(payload)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "engine": "python-error"}))


if __name__ == "__main__":
    main()
