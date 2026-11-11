from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class User:
    id: str
    email: str
    name: str
    auraAccountType: str
    paypalAccountType: str
    merchantVerificationStatus: str
    merchantAccessEnabled: bool

@dataclass
class Account:
    id: str
    name: str
    type: str
    institution: str
    balance: float
    currency: str
    lastSyncedAt: Optional[str] = None

@dataclass
class Transaction:
    id: str
    date: str
    merchant: str
    description: str
    category: str
    amount: float
    type: str
    accountName: Optional[str] = None
    isUnusual: bool = False
    unusualReason: Optional[str] = None

@dataclass
class FinancialPlan:
    id: str
    title: str
    totalCommitments: float
    totalEssentialBudget: float
    totalDiscretionaryBudget: float
    totalSavingsTarget: float
    aiSummary: str
    allocations: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class Goal:
    id: str
    title: str
    targetAmount: float
    currentAmount: float
    status: str
    targetDate: Optional[str] = None
    monthlyContribution: Optional[float] = None

@dataclass
class Mandate:
    id: str
    title: str
    merchant: str
    category: str
    amount: float
    dueDayOfMonth: int
    status: str

@dataclass
class GridSavedView:
    gridId: str
    name: str
    id: Optional[str] = None
    filterModel: Optional[Dict[str, Any]] = None
    sortModel: Optional[List[Dict[str, Any]]] = None
    columnVisibility: Optional[Dict[str, bool]] = None
    createdAt: Optional[str] = None

@dataclass
class SelectionSummary:
    totalAmount: float
    currency: str
    itemCount: int
    averageAmount: Optional[float] = None

@dataclass
class SelectionContextResult:
    source: str
    gridId: str
    totalSelected: int
    summary: SelectionSummary
    records: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class AiAskResponse:
    success: bool = True
    response: str = ""
    executedAction: Optional[Dict[str, Any]] = None
