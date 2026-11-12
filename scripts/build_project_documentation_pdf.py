import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # Skip running header/footer on title cover page
            return

        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0284C7")) # Cyan/Blue accent
        self.drawString(54, 755, "AURA: AI-POWERED FINANCIAL CO-PILOT")

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B")) # Slate
        self.drawRightString(558, 755, "PayPal + AI Hackathon Submission")

        # Top rule
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(54, 747, 558, 747)

        # Bottom rule
        self.line(54, 45, 558, 45)

        # Footer
        self.drawString(54, 32, "Confidential — Prepared for Hackathon Judging Panel")
        self.drawRightString(558, 32, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def build_pdf():
    output_dir = r"c:\Users\alanj\AURA\AURA_Submission"
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = os.path.join(output_dir, "AURA_Project_Documentation.pdf")
    arch_img_path = os.path.join(output_dir, "AURA_Architecture.png")

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    c_primary = colors.HexColor("#0F172A")
    c_secondary = colors.HexColor("#0369A1")
    c_accent = colors.HexColor("#0284C7")
    c_dark_slate = colors.HexColor("#1E293B")
    c_body = colors.HexColor("#334155")
    c_muted = colors.HexColor("#64748B")
    c_bg_light = colors.HexColor("#F8FAFC")
    c_border = colors.HexColor("#CBD5E1")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=26,
        leading=32,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_accent,
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=c_primary,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=c_secondary,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=c_body,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_body,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=3
    )

    quote_style = ParagraphStyle(
        'DocQuote',
        parent=styles['Normal'],
        fontName='Helvetica-BoldOblique',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#0369A1"),
        alignment=1, # Center
        spaceBefore=8,
        spaceAfter=8
    )

    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0F172A")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=c_dark_slate
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=c_dark_slate
    )

    story = []

    # ==================== COVER HEADER ====================
    story.append(Spacer(1, 10))
    story.append(Paragraph("AURA: Your AI-Powered Financial Co-Pilot", title_style))
    story.append(Paragraph("PayPal + AI Hackathon Official Submission Documentation", subtitle_style))

    # Meta banner table
    meta_data = [
        [
            Paragraph("<b>Repository:</b> github.com/AlanJ-2004/AURA", table_cell_style),
            Paragraph("<b>Target Track:</b> PayPal + AI Hackathon", table_cell_style),
            Paragraph("<b>Build Duration:</b> 12-Day Sprint", table_cell_style)
        ],
        [
            Paragraph("<b>Live App:</b> aura-frontend-izl2.onrender.com", table_cell_style),
            Paragraph("<b>Backend API:</b> aura-backend-api-88nx.onrender.com", table_cell_style),
            Paragraph("<b>Date:</b> November 2026", table_cell_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[170, 170, 164])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # Central Quote Callout
    quote_data = [[
        Paragraph(
            "“Personal finance tools show you what happened.<br/>"
            "AURA helps you decide what happens next.”",
            quote_style
        )
    ]]
    quote_table = Table(quote_data, colWidths=[504])
    quote_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#E0F2FE")),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor("#0284C7")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 16),
        ('RIGHTPADDING', (0,0), (-1,-1), 16),
    ]))
    story.append(quote_table)
    story.append(Spacer(1, 12))

    # ==================== 1. PROJECT OVERVIEW ====================
    story.append(Paragraph("1. Project Overview", h1_style))
    story.append(Paragraph(
        "<b>AURA (Autonomous Unified Resource Assistant)</b> is an intelligent financial co-pilot and autonomous commerce "
        "platform that bridges the long-standing disconnect between consumer spending desires and long-term financial health. "
        "Traditional financial tools are fundamentally backward-looking: they categorize transactions days after money has been spent, "
        "render retrospective pie charts, and offer post-facto budget reprimands. E-commerce platforms operate with an opposing incentive: "
        "minimizing friction to maximize impulse checkouts, completely blind to the shopper's actual budget, debts, or savings goals.",
        body_style
    ))
    story.append(Paragraph(
        "AURA fundamentally transforms this dynamic. Built on the <b>PayPal Developer Platform (Sandbox)</b> and powered by "
        "<b>Google Gemini 3.1 Flash-Lite</b> alongside an autonomous <b>Astropods 6-agent fleet</b> and Python predictive ML analytics, "
        "AURA assists users throughout the entire decision lifecycle. When a user expresses purchase intent, AURA autonomously discovers "
        "verified merchant products via Channel3, computes real-time mathematical impacts against savings goals and recurring commitments, "
        "presents transparent trade-offs, and executes secure PayPal Sandbox checkouts with zero friction—all while maintaining strict "
        "user-in-the-loop spend control. Furthermore, AURA provides sellers with a real-time <b>Merchant Hub</b> workbench to track sales, "
        "manage order fulfillment, and inject tracking data into PayPal's shipment ecosystem.",
        body_style
    ))

    # ==================== 2. INSPIRATION ====================
    story.append(Spacer(1, 6))
    story.append(Paragraph("2. Inspiration & The Core Problem", h1_style))
    story.append(Paragraph(
        "Every single day, millions of online shoppers face the exact same internal hesitation: <i>'I really want to buy this, but can I "
        "genuinely afford it right now without derailing my emergency fund or next month's rent?'</i>",
        body_style
    ))
    story.append(Paragraph(
        "Until now, answering that question required tedious mental math, toggling between banking apps and shopping tabs, or simply giving in "
        "to impulse and feeling regret days later. We envisioned a world where autonomous AI doesn't just automate commerce for merchants, "
        "but acts as a faithful, proactive guardian for the consumer's wallet. By deeply coupling PayPal's trusted checkout and transaction "
        "infrastructure with agentic artificial intelligence, AURA turns shopping from a blind financial risk into a deliberate, goal-aligned choice.",
        body_style
    ))

    # ==================== 3. WHAT AURA DOES ====================
    story.append(Spacer(1, 6))
    story.append(Paragraph("3. What AURA Does: End-to-End Capabilities", h1_style))
    story.append(Paragraph(
        "AURA delivers a unified financial operating system with six core pillars:",
        body_style
    ))

    features = [
        ("Autonomous Product Discovery", "Integrates the Channel3 Commerce API to query live merchant catalogs, compare real-time specifications, pricing, seller ratings, and shipping speeds directly in natural language."),
        ("Predictive Financial Impact Analysis", "Before any purchase is finalized, AURA calculates the exact downstream consequence on active savings targets (e.g., 'Delays Emergency Fund by 12 days') and validates cash flow against upcoming commitments."),
        ("Secure PayPal Sandbox Checkout", "Orchestrates seamless order creation and capture via the PayPal Orders v2 API with standard intent: CAPTURE, structured purchase units, and zero client-side credential exposure."),
        ("Automated Order & Shipment Tracking", "Synchronizes order status in real time, injecting carrier tracking numbers via PayPal's Shipment Tracking API and handling automated notifications across buyer and seller portals."),
        ("Comprehensive Merchant Hub", "Provides merchants with real-time gross revenue metrics, AG Grid transaction workbenches, order fulfillment workflows, and automated payout tracking."),
        ("Conversational 'Ask AURA' Co-Pilot", "An autonomous conversational interface with bi-directional client navigation and server-side tool calling, allowing users to navigate screens, query accounts, and manage goals via natural language.")
    ]
    for title, desc in features:
        story.append(Paragraph(f"• <b>{title}:</b> {desc}", bullet_style))

    # ==================== 4. PAYPAL INTEGRATION ====================
    story.append(PageBreak())
    story.append(Paragraph("4. PayPal Developer Platform Integration", h1_style))
    story.append(Paragraph(
        "The PayPal Developer Platform serves as the transactional backbone of AURA. Rather than using mock implementations, "
        "AURA executes real, live HTTPS REST calls against the PayPal Sandbox environment across five distinct APIs and services.",
        body_style
    ))

    # Detailed PayPal Table
    paypal_rows = [
        [
            Paragraph("<b>PayPal API / Tool</b>", table_header_style),
            Paragraph("<b>Endpoints & Methods</b>", table_header_style),
            Paragraph("<b>Payload & Parameters</b>", table_header_style),
            Paragraph("<b>AURA Business Logic & Handlers</b>", table_header_style)
        ],
        [
            Paragraph("<b>Orders v2 API</b><br/>(Core Checkout)", table_cell_bold),
            Paragraph("<code>POST /v2/checkout/orders</code><br/><code>POST /v2/checkout/orders/{id}/capture</code><br/><code>GET /v2/checkout/orders/{id}</code>", table_cell_style),
            Paragraph("<code>intent: 'CAPTURE'</code><br/><code>purchase_units: [{ amount: { currency_code: 'USD', value: '...' }, reference_id: '...' }]</code><br/><code>application_context: { return_url, cancel_url, user_action: 'PAY_NOW' }</code>", table_cell_style),
            Paragraph("Creates live sandbox order upon item selection. Renders PayPal checkout modal. On user capture, persists transaction in MongoDB, updates user wallet balances, deducts from category budget, and dispatches fulfillment event.", table_cell_style)
        ],
        [
            Paragraph("<b>Identity & OAuth API</b><br/>(Auth & Token Mgmt)", table_cell_bold),
            Paragraph("<code>POST /v1/oauth2/token</code><br/><code>GET /v1/identity/oauth2/userinfo</code>", table_cell_style),
            Paragraph("Header: <code>Authorization: Basic base64(client_id:secret)</code><br/>Body: <code>grant_type=client_credentials</code>", table_cell_style),
            Paragraph("Generates bearer tokens with automatic in-memory caching and 5-minute skew-buffer expiration. Differentiates Personal buyer credentials from Merchant facilitator accounts.", table_cell_style)
        ],
        [
            Paragraph("<b>Transaction Reporting API</b><br/>(Historical Sync)", table_cell_bold),
            Paragraph("<code>GET /v1/reporting/transactions</code>", table_cell_style),
            Paragraph("Query: <code>start_date={ISO}&end_date={ISO}&page_size=100&fields=all</code>", table_cell_style),
            Paragraph("Retrieves multi-month transaction histories for connected accounts. Ingests fees, net amounts, transaction status, and payer metadata into AURA's analytics engine.", table_cell_style)
        ],
        [
            Paragraph("<b>Webhooks API</b><br/>(Event Automation)", table_cell_bold),
            Paragraph("<code>POST /api/webhooks/paypal</code><br/>(Inbound webhook listener)", table_cell_style),
            Paragraph("Events: <code>CHECKOUT.ORDER.APPROVED</code><br/><code>PAYMENT.CAPTURE.COMPLETED</code><br/><code>PAYMENT.CAPTURE.DENIED</code>", table_cell_style),
            Paragraph("Verifies PayPal transmission signatures using PayPal SDK certificate verification. Executes asynchronous post-payment workflows, updates goal trackers, and triggers merchant notifications.", table_cell_style)
        ],
        [
            Paragraph("<b>Shipment Tracking API</b><br/>(Fulfillment)", table_cell_bold),
            Paragraph("<code>POST /v1/shipping/trackers-batch</code><br/><code>POST /v1/shipping/trackers</code>", table_cell_style),
            Paragraph("<code>transaction_id, tracking_number, status: 'SHIPPED', carrier: 'USPS' | 'UPS' | 'FEDEX'</code>", table_cell_style),
            Paragraph("When merchant marks order fulfilled in Merchant Hub, injects official tracking numbers into PayPal's order ledger, keeping buyer and seller protected under PayPal Seller Protection.", table_cell_style)
        ]
    ]

    paypal_table = Table(paypal_rows, colWidths=[95, 125, 140, 144])
    paypal_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(paypal_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("PayPal Sandbox Test Configuration & Architecture", h2_style))
    story.append(Paragraph(
        "AURA isolates all development and live testing strictly within the official PayPal Sandbox environment. "
        "Two pre-configured persona accounts enable end-to-end evaluation without financial exposure:<br/>"
        "• <b>Personal Buyer Account:</b> <code>alex@aura-demo.finance</code> — Simulates consumer purchasing, goal tracking, and wallet balance adjustments.<br/>"
        "• <b>Merchant Business Account:</b> <code>bruce_wayne@business.example.com</code> — Acts as the verified merchant facilitator, receiving payments, viewing transaction batches, and managing order dispatches.",
        body_style
    ))

    # ==================== 5. ARTIFICIAL INTELLIGENCE INTEGRATION ====================
    story.append(PageBreak())
    story.append(Paragraph("5. Artificial Intelligence Integration", h1_style))
    story.append(Paragraph(
        "AURA's intelligence tier is a synchronized multi-model ecosystem designed for deterministic financial execution. "
        "Rather than relying on unstructured text generation, AURA couples Google Gemini LLMs with an autonomous Astropods agent fleet "
        "and Python predictive machine learning services.",
        body_style
    ))

    story.append(Paragraph("A. Google Gemini 3.1 Flash-Lite & Function Tool Calling", h2_style))
    story.append(Paragraph(
        "AURA utilizes <b>gemini-3.1-flash-lite</b> as its central conversational orchestrator due to its ultra-low latency (<400ms token generation), "
        "exceptional reasoning capabilities, and robust function-calling fidelity. Gemini evaluates natural language user intents, extracts structured arguments, "
        "and executes registered application tools before formulating verified responses.",
        body_style
    ))

    ai_tools_data = [
        [
            Paragraph("<b>Registered Tool Name</b>", table_header_style),
            Paragraph("<b>Arguments Schema</b>", table_header_style),
            Paragraph("<b>Execution Action & Runtime Target</b>", table_header_style)
        ],
        [
            Paragraph("<code>navigate_to_page</code>", table_cell_bold),
            Paragraph("<code>destination: string, params: object</code>", table_cell_style),
            Paragraph("Dispatches autonomous client-side navigation via React Router without page refresh while preserving active chat state.", table_cell_style)
        ],
        [
            Paragraph("<code>get_financial_summary</code>", table_cell_bold),
            Paragraph("<code>userId: string, timeframe: string</code>", table_cell_style),
            Paragraph("Queries MongoDB for real-time liquid balance, total commitments, active goals, and available discretionary budget.", table_cell_style)
        ],
        [
            Paragraph("<code>search_products</code>", table_cell_bold),
            Paragraph("<code>query: string, maxPrice: number, category: string</code>", table_cell_style),
            Paragraph("Calls Channel3 Commerce API to retrieve matching merchant inventory, live prices, specs, and stock availability.", table_cell_style)
        ],
        [
            Paragraph("<code>analyze_purchase_impact</code>", table_cell_bold),
            Paragraph("<code>amount: number, category: string, itemId: string</code>", table_cell_style),
            Paragraph("Executes mathematical simulation against savings velocity; calculates exact days delayed per active goal and cash flow delta.", table_cell_style)
        ],
        [
            Paragraph("<code>execute_checkout</code>", table_cell_bold),
            Paragraph("<code>itemId: string, quantity: number, shipping: object</code>", table_cell_style),
            Paragraph("Invokes backend PayPal Orders v2 integration to initiate sandbox transaction and generate client approveUrl.", table_cell_style)
        ],
        [
            Paragraph("<code>get_order_status</code>", table_cell_bold),
            Paragraph("<code>orderId: string</code>", table_cell_style),
            Paragraph("Fetches real-time fulfillment status and PayPal shipment tracking updates for active purchases.", table_cell_style)
        ]
    ]

    ai_tools_table = Table(ai_tools_data, colWidths=[130, 150, 224])
    ai_tools_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0369A1")),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(ai_tools_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("B. Astropods Autonomous 6-Agent Cloud Fleet", h2_style))
    story.append(Paragraph(
        "Complex financial operations are partitioned across six specialized Astropods agents running in isolated container contexts:",
        body_style
    ))
    agents = [
        ("1. financial-planner", "Maintains long-term wealth projections, calculates runway, evaluates emergency fund integrity, and computes debt-avalanche payoff schedules."),
        ("2. investment-researcher", "Analyzes portfolio diversification, evaluates market risk exposure, and monitors real-time macroeconomic trends."),
        ("3. shopping-assistant", "Scrapes merchant catalogs via Channel3, compares price histories, finds coupon codes, and evaluates product durability reviews."),
        ("4. merchant-assistant", "Empowers sellers with predictive inventory depletion alerts, transaction dispute risk scoring, and fee optimization."),
        ("5. developer-agent", "Monitors API latency, validates PayPal webhook signature integrity, and runs automated health checks on data pipelines."),
        ("6. supervisor-agent", "Orchestrates multi-domain requests, synthesizes findings from multiple subagents into a coherent financial recommendation.")
    ]
    for name, desc in agents:
        story.append(Paragraph(f"• <b>{name}:</b> {desc}", bullet_style))

    story.append(Spacer(1, 6))
    story.append(Paragraph("C. Python Predictive Analytics & Machine Learning Engine", h2_style))
    story.append(Paragraph(
        "A dedicated Python FastAPI service executes specialized numerical algorithms: time-series spending forecasting using customized "
        "exponential smoothing and ARIMA, Isolation Forest anomaly detection for unexpected subscription spikes, and Monte Carlo goal completion probability calculations.",
        body_style
    ))

    # ==================== 6. SYSTEM ARCHITECTURE ====================
    story.append(PageBreak())
    story.append(Paragraph("6. System Architecture & High-Resolution Diagram", h1_style))
    story.append(Paragraph(
        "AURA's architecture is structured into five distinct, decoupled layers providing enterprise reliability, strict separation of concerns, "
        "and sub-second response times across both conversational and transactional flows.",
        body_style
    ))

    # Embed Architecture Image
    if os.path.exists(arch_img_path):
        story.append(Image(arch_img_path, width=504, height=315))
        story.append(Paragraph("<i>Figure 1: AURA End-to-End System Architecture (5-Layer Modular Design)</i>", ParagraphStyle(
            'FigCaption', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8, alignment=1, textColor=c_muted, spaceBefore=4, spaceAfter=8
        )))

    arch_layers = [
        ("1. Frontend Layer (Client)", "Built with React 19, TypeScript, Vite, Tailwind CSS, Lucide icons, and AG Grid Enterprise workbench. Features dual-mode personal/merchant dashboards, instant responsive theme toggling, and floating Ask AURA chat modal."),
        ("2. Orchestration & API Layer", "Node.js / Express backend with modular controllers, JWT authentication, rate limiting, and Server-Sent Events (SSE) for streaming agent responses and real-time dashboard notifications."),
        ("3. Agent Fleet Layer", "Astropods multi-agent framework orchestrating 6 autonomous domain agents with inter-agent message buses and supervisor arbitration."),
        ("4. AI & Analytics Engine", "Gemini 3.1 Flash-Lite tool orchestration alongside Python FastAPI ML microservices running predictive cash flow and goal-impact simulations."),
        ("5. External Integrations Layer", "PayPal Sandbox REST ecosystem (Orders v2, Identity, Reporting, Webhooks, Tracking), Channel3 Commerce discovery, MongoDB Atlas persistence, and ChromaDB vector embeddings.")
    ]
    for layer, desc in arch_layers:
        story.append(Paragraph(f"• <b>{layer}:</b> {desc}", bullet_style))

    # ==================== 7. KEY WORKFLOW ====================
    story.append(PageBreak())
    story.append(Paragraph("7. Key User Workflow: 'I Want to Buy a Laptop'", h1_style))
    story.append(Paragraph(
        "The following 10-step sequence demonstrates the marquee end-to-end integration across AURA's AI agents, Channel3 commerce catalog, "
        "financial impact math, and PayPal Sandbox payment capture:",
        body_style
    ))

    workflow_steps = [
        ("Step 1: User Request", "Alex asks Ask AURA: <i>'I want to buy a development laptop for under $1,000.'</i>"),
        ("Step 2: Intent & Agent Delegation", "Supervisor agent parses intent, engages <code>shopping-assistant</code> and invokes <code>search_products</code>."),
        ("Step 3: Catalog Query via Channel3", "Channel3 API queries verified electronics merchants, filtering models under $1,000 with >16GB RAM."),
        ("Step 4: Financial Baseline Retrieval", "Supervisor invokes <code>get_financial_summary</code>, pulling Alex's liquid cash ($4,250), recurring bills ($1,800/mo), and goals."),
        ("Step 5: Impact Simulation", "Python ML engine runs impact: purchasing an $899 laptop consumes 21% of liquid funds and delays Alex's 'Emergency Fund' target by 12 days."),
        ("Step 6: Transparent Presentation", "Ask AURA presents 3 laptop options with technical specs, seller trust scores, and clear financial trade-off badges."),
        ("Step 7: User Decision & Confirmation", "Alex selects the Dell XPS 13 at $899 and explicitly clicks <i>'Proceed with PayPal'</i>."),
        ("Step 8: PayPal Sandbox Order Creation", "Backend invokes <code>POST /v2/checkout/orders</code> with <code>intent: CAPTURE</code> and launches the secure PayPal Sandbox modal."),
        ("Step 9: Secure Capture & Record", "Alex logs into PayPal Sandbox buyer account and approves payment. Backend captures order, stores receipt in MongoDB, and recalculates goal pacing."),
        ("Step 10: Merchant Fulfillment & Tracking", "Order instantly appears in Bruce Wayne's Merchant Hub. When marked shipped, tracking number is sent to PayPal Shipment Tracking API and Alex is notified.")
    ]

    for title, desc in workflow_steps:
        story.append(Paragraph(f"<b>{title}:</b> {desc}", bullet_style))

    # ==================== 8. SECURITY & USER CONTROL ====================
    story.append(Spacer(1, 8))
    story.append(Paragraph("8. Security, User Control & Guardrails", h1_style))
    story.append(Paragraph(
        "Financial autonomy requires uncompromised security. AURA enforces three non-negotiable principles:<br/>"
        "• <b>User-in-the-Loop Spending:</b> AURA never executes a purchase autonomously. AI agents recommend, analyze, and prepare transactions, but the user must explicitly authorize checkout inside the PayPal interface.<br/>"
        "• <b>Sandbox Isolation & Zero Data Leakage:</b> Operating strictly within PayPal Sandbox, no real monetary instruments are touched. Model system prompts strip sensitive PII before invoking Gemini APIs.<br/>"
        "• <b>Secure Credential Handling:</b> Client secrets, OAuth tokens, and encryption keys are stored exclusively in backend environment variables, with strict CORS and JWT authorization.",
        body_style
    ))

    # ==================== 9. CHALLENGES & SOLUTIONS ====================
    story.append(PageBreak())
    story.append(Paragraph("9. Challenges Encountered & Technical Solutions", h1_style))

    challenges = [
        ("Multi-Agent Tool Determinism", "LLMs occasionally hallucinated tool parameter types. We resolved this by implementing strict Zod schema validation interceptors in Node.js, ensuring tool calls fail gracefully with clarifying prompts if parameters are invalid."),
        ("PayPal Webhook Routing in Local & Cloud Environments", "Managing asynchronous webhooks across cloud deployments required establishing robust idempotency keys and signature validation fallback handlers to prevent duplicate transaction recording."),
        ("React 19 Compatibility with Enterprise Workbenches", "React 19's asynchronous transitions required careful reconciliation with AG Grid and headless chart components, achieved via React 19 Actions and localized memoization."),
        ("Real-Time Cross-Persona Synchronization", "Reflecting buyer purchases instantly on the merchant dashboard without manual page refreshes was solved by implementing Server-Sent Events (SSE) broadcasting transaction updates.")
    ]
    for problem, solution in challenges:
        story.append(Paragraph(f"• <b>{problem}:</b> {solution}", bullet_style))

    # ==================== 10. ACCOMPLISHMENTS ====================
    story.append(Spacer(1, 6))
    story.append(Paragraph("10. Accomplishments & What We Are Proud Of", h1_style))
    story.append(Paragraph(
        "• <b>12-Day Sprint to Production:</b> Designed, developed, and deployed a full-stack, enterprise-grade application in 12 days.<br/>"
        "• <b>Genuine PayPal Sandbox Integration:</b> Fully functional Orders v2 checkout, OAuth token management, and tracking endpoints—zero mocks.<br/>"
        "• <b>Unified Dual-Persona Platform:</b> Seamlessly handles personal financial co-piloting and merchant fulfillment in a single codebase.<br/>"
        "• <b>Actionable AI:</b> Ask AURA executes actual UI navigation and transaction workflows rather than offering generic text advice.",
        body_style
    ))

    # ==================== 11. WHAT WE LEARNED ====================
    story.append(Spacer(1, 6))
    story.append(Paragraph("11. What We Learned", h1_style))
    story.append(Paragraph(
        "Building AURA demonstrated that combining transactional APIs like PayPal with agentic LLMs creates a powerful paradigm shift. "
        "We learned that users do not want AI that merely spends their money; they want AI that protects their future while making commerce effortless.",
        body_style
    ))

    # ==================== 12. WHAT'S NEXT ====================
    story.append(Spacer(1, 6))
    story.append(Paragraph("12. What's Next for AURA", h1_style))
    story.append(Paragraph(
        "• <b>Production PayPal Migration:</b> Transitioning from Sandbox to PayPal Live with real-time merchant onboarding.<br/>"
        "• <b>Subscription Auto-Negotiator:</b> Autonomous detection and cancellation of unused recurring subscriptions via PayPal Billing Agreements.<br/>"
        "• <b>Native Mobile Experience:</b> React Native mobile app with real-time push notifications for goal milestones and order dispatches.",
        body_style
    ))

    # ==================== 13. CONCLUSION ====================
    story.append(Spacer(1, 10))
    story.append(Paragraph("13. Conclusion", h1_style))
    story.append(Paragraph(
        "AURA represents the next evolution of personal finance and digital commerce. By placing an intelligent, goal-aware AI co-pilot "
        "at the point of sale, we turn everyday purchasing into a conscious step toward financial freedom.",
        body_style
    ))
    story.append(Spacer(1, 8))

    conclusion_box = [
        [
            Paragraph(
                "“Your money, your goals, your decisions. AURA is here to help you make them count.”",
                ParagraphStyle(
                    'FinalQuote',
                    parent=styles['Normal'],
                    fontName='Helvetica-Bold',
                    fontSize=13,
                    leading=18,
                    textColor=colors.HexColor("#0284C7"),
                    alignment=1
                )
            )
        ]
    ]
    conclusion_table = Table(conclusion_box, colWidths=[504])
    conclusion_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#0F172A")),
        ('BOX', (0,0), (-1,-1), 2, colors.HexColor("#0284C7")),
        ('TOPPADDING', (0,0), (-1,-1), 12),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('LEFTPADDING', (0,0), (-1,-1), 16),
        ('RIGHTPADDING', (0,0), (-1,-1), 16),
    ]))
    story.append(conclusion_table)

    # Build document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generated successfully at: {pdf_path}")

if __name__ == "__main__":
    build_pdf()
