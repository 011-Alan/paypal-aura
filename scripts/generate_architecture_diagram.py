import matplotlib.pyplot as plt
import matplotlib.patches as patches

def create_architecture_diagram(output_path="AURA_Submission/AURA_Architecture.png"):
    fig = plt.figure(figsize=(20, 13), facecolor='#090D16')
    ax = fig.add_subplot(111)
    ax.set_facecolor('#090D16')
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    # Color Palette
    bg_card = '#111827'
    border_card = '#1E293B'
    text_primary = '#FFFFFF'
    text_secondary = '#94A3B8'
    accent_blue = '#38BDF8'
    accent_cyan = '#06B6D4'
    accent_purple = '#A855F7'
    accent_emerald = '#10B981'
    accent_amber = '#F59E0B'
    accent_paypal = '#0070BA'

    # Title Banner
    ax.text(50, 96.5, "PROJECT AURA — SYSTEM ARCHITECTURE",
            fontsize=24, fontweight='bold', color=text_primary, ha='center', va='center', fontfamily='sans-serif')
    ax.text(50, 93.8, "Autonomous Financial Understanding, Conversational Multi-Model AI & Agentic PayPal Commerce",
            fontsize=12, color=accent_blue, ha='center', va='center', fontfamily='sans-serif')

    def draw_box(x, y, w, h, title, subtitle="", border_color=border_card, bg=bg_card, title_color=text_primary, radius=0.8):
        box = patches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle=f"round,pad={radius},rounding_size=1.2",
            linewidth=1.5, edgecolor=border_color, facecolor=bg
        )
        ax.add_patch(box)
        if title:
            ax.text(x + w / 2, y + h - 2.0, title, fontsize=10.5, fontweight='bold', color=title_color, ha='center', va='center', fontfamily='sans-serif')
        if subtitle:
            ax.text(x + w / 2, y + h - 4.5, subtitle, fontsize=8.5, color=text_secondary, ha='center', va='center', fontfamily='sans-serif')

    def draw_layer_container(x, y, w, h, label, color):
        container = patches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle="round,pad=1.2,rounding_size=2.0",
            linewidth=1.8, edgecolor=color, facecolor='#0D1322', alpha=0.9
        )
        ax.add_patch(container)
        # Header Badge
        badge = patches.FancyBboxPatch(
            (x + 2, y + h - 3.2), len(label) * 0.95 + 4, 3.2,
            boxstyle="round,pad=0.4,rounding_size=0.8",
            linewidth=1, edgecolor=color, facecolor='#162036'
        )
        ax.add_patch(badge)
        ax.text(x + 3.5, y + h - 1.6, label.upper(), fontsize=9.5, fontweight='bold', color=color, va='center', fontfamily='sans-serif')

    # =========================================================================
    # 1. PRESENTATION LAYER (Top: Y = 74 to 90)
    # =========================================================================
    draw_layer_container(3, 75, 94, 16.5, "1. Presentation Layer (React 18 + Vite + Tailwind CSS)", accent_cyan)

    pres_items = [
        ("AURA Dashboard", "Financial Overview & Balance Verification", 5, 76.5, 13.5, 9),
        ("Ask AURA Companion", "Streaming Conversational Agent Panel", 20.5, 76.5, 14.5, 9),
        ("Spending & AG Grid", "Multi-Column Filter & PayPal Sync", 37, 76.5, 14, 9),
        ("AURA Commerce", "Channel3 Discovery & Affordability", 53, 76.5, 14, 9),
        ("Merchant Hub", "Orders, Staging & Settlement Grid", 69, 76.5, 13.5, 9),
        ("Financial Calendar", "Bryntum Timeline & Recurring Bills", 84.5, 76.5, 11, 9)
    ]
    for title, sub, x, y, w, h in pres_items:
        draw_box(x, y, w, h, title, sub, border_color='#0284C7', bg='#101C33', title_color='#E0F2FE')

    # =========================================================================
    # 2. BACKEND SERVICES LAYER (Y = 48 to 70)
    # =========================================================================
    draw_layer_container(3, 49, 94, 21.5, "2. Backend Application & Microservices Layer (Node.js 24 + TypeScript + Express)", accent_blue)

    be_items = [
        ("Authentication & Security", "Argon2id PIN/Pass • JWT • Privacy", 5, 50.5, 13.5, 9.5),
        ("AI Orchestrator Engine", "Gemini Request Queue • Tool Dispatch", 20.5, 50.5, 14.5, 9.5),
        ("PayPal Sync & Reporting", "Historical Windows • Ledger Reconciliation", 37, 50.5, 14, 9.5),
        ("E-Commerce & Orders Engine", "Cart Calculations • Orders v2 Capture", 53, 50.5, 14, 9.5),
        ("Payment Guardian", "Discretionary Cap & Risk Analysis", 69, 50.5, 13.5, 9.5),
        ("Durable Background Workers", "Scheduled Tasks • Webhook Handlers", 84.5, 50.5, 11, 9.5),
    ]
    for title, sub, x, y, w, h in be_items:
        draw_box(x, y, w, h, title, sub, border_color='#1E40AF', bg='#0F172A', title_color='#93C5FD')

    # Sub-services banner
    ax.text(50, 64.5, "RESTful API Endpoints (/api/*)  •  SSE Streaming (/api/ai/ask/stream)  •  Audit Logging  •  Cross-Origin Security",
            fontsize=8.5, color='#64748B', ha='center', va='center', fontfamily='sans-serif')

    # =========================================================================
    # 3. AI & INTELLIGENCE LAYER (Left-Center: Y = 21 to 44, X = 3 to 48)
    # =========================================================================
    draw_layer_container(3, 22, 45, 22.5, "3. AI & Analytics Layer", accent_purple)

    ai_items = [
        ("Google Gemini 3.8 / 3.1 Flash", "Autonomous Reasoning & Multi-turn Tool Calling", 5, 30.5, 19.5, 8.5),
        ("Gemini Embedding 2", "Vector Semantic Index & Query Cache", 26.5, 30.5, 19.5, 8.5),
        ("Astropods Multi-Agent Cloud", "Planner • Guardian • Mandate • Recovery", 5, 23.5, 19.5, 6),
        ("Python Analytics Engine", "scikit-learn • Pandas • Anomaly Scoring", 26.5, 23.5, 19.5, 6)
    ]
    for title, sub, x, y, w, h in ai_items:
        draw_box(x, y, w, h, title, sub, border_color='#7C3AED', bg='#171026', title_color='#D8B4FE')

    # =========================================================================
    # 4. EXTERNAL SERVICES & SPONSORS LAYER (Right-Center: Y = 21 to 44, X = 51 to 97)
    # =========================================================================
    draw_layer_container(51, 22, 46, 22.5, "4. External Integrations (PayPal Sandbox & Partners)", accent_amber)

    ext_items = [
        ("PayPal Orders v2 API", "Server-authoritative Order & Cryptographic Capture", 53, 33, 20.5, 6.5),
        ("PayPal Identity (OIDC)", "OAuth 2.0 PKCE • Profile & Verified Address", 75.5, 33, 19.5, 6.5),
        ("PayPal Reporting APIs", "Multi-Month Historical Search & Balances", 53, 24, 20.5, 7.5),
        ("Webhooks & Tracking API", "Carrier Dispatch Sync & Async Events", 75.5, 24, 19.5, 7.5)
    ]
    for title, sub, x, y, w, h in ext_items:
        draw_box(x, y, w, h, title, sub, border_color='#D97706', bg='#1F1608', title_color='#FDE68A')

    # =========================================================================
    # 5. DATA PERSISTENCE LAYER (Bottom: Y = 2 to 17)
    # =========================================================================
    draw_layer_container(3, 2.5, 94, 15.5, "5. Data Persistence Layer (MongoDB 7.x Primary Store + Elasticsearch 8.x Hybrid Index)", accent_emerald)

    db_items = [
        ("User & Identity Store", "Argon2id Hash • Scopes • AccountType", 5, 4, 13.5, 8.5),
        ("Transaction Ledger", "Stable paypalTransactionId • Fees • Net", 20.5, 4, 14.5, 8.5),
        ("E-Commerce Orders", "PayPal OrderID • Tracking • 7 Stages", 37, 4, 14, 8.5),
        ("Financial Accounts", "Checking • Savings • Reconciled Balances", 53, 4, 14, 8.5),
        ("Commitments & Goals", "Recurring Mandates • 50/30/20 Budget", 69, 4, 13.5, 8.5),
        ("Audit & Conversations", "Multi-Turn Dialogue Context & History", 84.5, 4, 11, 8.5)
    ]
    for title, sub, x, y, w, h in db_items:
        draw_box(x, y, w, h, title, sub, border_color='#059669', bg='#061D15', title_color='#A7F3D0')

    # =========================================================================
    # ARROWS & CONNECTORS
    # =========================================================================
    # 1. UI -> Backend
    ax.annotate('', xy=(50, 70.8), xytext=(50, 74.8),
                arrowprops=dict(arrowstyle="<->", color=accent_cyan, lw=2.2))
    ax.text(50.8, 72.8, "HTTPS / REST & Server-Sent Events", fontsize=8, color=accent_cyan, va='center', fontfamily='sans-serif')

    # 2. Backend -> AI Layer
    ax.annotate('', xy=(25, 44.8), xytext=(25, 48.8),
                arrowprops=dict(arrowstyle="<->", color=accent_purple, lw=2.2, linestyle='--'))
    ax.text(25.8, 46.8, "AI Tool Calling & Semantic Context", fontsize=8, color=accent_purple, va='center', fontfamily='sans-serif')

    # 3. Backend -> External PayPal Services
    ax.annotate('', xy=(74, 44.8), xytext=(74, 48.8),
                arrowprops=dict(arrowstyle="<->", color=accent_amber, lw=2.2))
    ax.text(74.8, 46.8, "PayPal Sandbox REST & Webhook Ingestion", fontsize=8, color=accent_amber, va='center', fontfamily='sans-serif')

    # 4. Backend -> Data Layer
    ax.annotate('', xy=(50, 18.2), xytext=(50, 21.8),
                arrowprops=dict(arrowstyle="<->", color=accent_emerald, lw=2.2))
    ax.text(50.8, 20.0, "Mongoose ODM Transactions & Atomic Upserts", fontsize=8, color=accent_emerald, va='center', fontfamily='sans-serif')

    # Legend at bottom right
    ax.text(94, 96.5, "AURA System Core", fontsize=9, color='#64748B', ha='right', va='center', fontfamily='sans-serif')
    ax.text(94, 94.5, "Live Sandbox Environment", fontsize=8, color=accent_emerald, ha='right', va='center', fontfamily='sans-serif')

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, facecolor='#090D16', edgecolor='none')
    plt.close()
    print(f"Architecture diagram successfully generated at: {output_path}")

if __name__ == "__main__":
    create_architecture_diagram()
