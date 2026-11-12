import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.pdfgen import canvas

class DemoScriptCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(DemoScriptCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(DemoScriptCanvas, self).showPage()
        super(DemoScriptCanvas, self).save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0284C7"))
        self.drawString(54, 755, "AURA: DEMO VIDEO RECORDING SCRIPT (3–5 MIN)")

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawRightString(558, 755, "PayPal + AI Hackathon 2026")

        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(54, 747, 558, 747)
        self.line(54, 45, 558, 45)

        self.drawString(54, 32, "Confidential — Demo Production Guidelines")
        self.drawRightString(558, 32, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def build_script_pdf():
    output_dir = r"c:\Users\alanj\AURA\AURA_Submission"
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = os.path.join(output_dir, "AURA_Demo_Script.pdf")

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    c_primary = colors.HexColor("#0F172A")
    c_accent = colors.HexColor("#0284C7")
    c_dark_slate = colors.HexColor("#1E293B")
    c_body = colors.HexColor("#334155")
    c_border = colors.HexColor("#CBD5E1")

    title_style = ParagraphStyle(
        'ScriptTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=c_primary,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'ScriptSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=c_accent,
        spaceAfter=12
    )

    h1_style = ParagraphStyle(
        'PartHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_primary,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    label_style = ParagraphStyle(
        'PartLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0369A1")
    )

    cell_style = ParagraphStyle(
        'PartCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=c_body
    )

    narration_style = ParagraphStyle(
        'NarrationCell',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#0F172A")
    )

    story = []

    # Title Banner
    story.append(Paragraph("AURA: Official Demo Video Script", title_style))
    story.append(Paragraph("Target Runtime: 4:30 – 5:00 Minutes | Resolution: 1080p 60fps", subtitle_style))

    # Meta Overview Box
    meta_info = [
        [
            Paragraph("<b>Target Audience:</b> PayPal & AI Hackathon Judges", cell_style),
            Paragraph("<b>Tone:</b> Confident, Conversational, Technical", cell_style),
            Paragraph("<b>Pacing:</b> 130–140 words per minute", cell_style)
        ]
    ]
    t_meta = Table(meta_info, colWidths=[170, 170, 164])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    parts = [
        {
            "num": "Part 1: The Hook (0:00 – 0:30)",
            "visual": "Fast-paced title sequence transitioning smoothly into the high-resolution AURA personal finance dashboard with real-time financial metrics, spending velocity charts, and active goals.",
            "narration": "\"Have you ever hesitated before clicking 'Buy Now', wondering: 'Can I genuinely afford this right now without wrecking my savings or missing next month's rent?' Most financial apps only tell you what happened after your money is already gone. E-commerce sites make impulse spending frictionless. Today, we're introducing AURA: the world's first AI financial co-pilot that puts financial intelligence directly at the point of purchase.\"",
            "action": "Open browser in 1920x1080 fullscreen. Hover cursor smoothly over the Emergency Fund goal bar ($3,200 of $5,000) and the liquid discretionary balance ($4,250).",
            "talking_point": "AURA is proactive, not retroactive. It bridges the gap between desire and financial health."
        },
        {
            "num": "Part 2: The Problem (0:30 – 1:00)",
            "visual": "Screen split: Traditional bank app showing retroactive categorized spending versus typical online store checkout with 'Buy Now with 1-Click' prompts.",
            "narration": "\"The core problem is simple: modern commerce tools are engineered to maximize impulse conversions. But your wallet and your future goals operate on long-term constraints. To make smart decisions today, consumers are forced to manually bounce between bank statements, spreadsheet budgets, and shopping tabs. There is no automated connection between 'I want this laptop' and 'This delays my house down payment by 3 months.' Until now.\"",
            "action": "Briefly highlight the disconnect; transition back to the live AURA application window.",
            "talking_point": "Consumers lack contextual decision support at the exact second they are about to spend."
        },
        {
            "num": "Part 3: Meet AURA (1:00 – 1:45)",
            "visual": "AURA personal overview: navigation menu, interactive financial goals, recurring commitments tracker, and the floating 'Ask AURA' AI companion interface.",
            "narration": "\"Meet AURA—the Autonomous Unified Resource Assistant. AURA connects your financial reality with your commerce desires using Google Gemini 3.1 Flash-Lite, an autonomous Astropods 6-agent fleet, and the PayPal Developer Platform. AURA doesn't just track your money—it actively reasons about every financial decision in real time, from product discovery to PayPal checkout execution.\"",
            "action": "Click floating 'Ask AURA' button in bottom right. Watch the panel smoothly slide open with pre-warmed conversation context. Click dark/light theme switch to show polished design.",
            "talking_point": "A full-stack, enterprise-grade architecture that pairs conversational AI with real transaction rails."
        },
        {
            "num": "Part 4: The Marquee Demo - Autonomous Shopping with Impact (1:45 – 3:00)",
            "visual": "Ask AURA chat window active. User types query. AI autonomously queries Channel3 live catalog, computes goal mathematical impact, and renders side-by-side product cards.",
            "narration": "\"Let's watch AURA in action. Our user, Alex, wants to purchase a new development laptop for under $1,000. Alex simply types: 'I want to buy a laptop for under $1,000.' Notice what happens: AURA's supervisor agent delegates the search to our shopping assistant, which queries the Channel3 Commerce API. Simultaneously, our financial planner agent pulls Alex's real-time liquid balance, recurring rent commitments, and emergency fund target. In seconds, AURA returns 3 verified laptops, but look at the badge: 'Buying the Dell XPS 13 for $899 fits your monthly budget, but delays your Emergency Fund goal by 12 days.' Real trade-offs, calculated instantly.\"",
            "action": "Type: 'I want to buy a laptop for under $1,000.' Watch real-time agent tool dispatch. Hover over the financial impact badge showing the 12-day emergency fund delay.",
            "talking_point": "AURA provides instant mathematical clarity on downstream goal impacts before a purchase happens."
        },
        {
            "num": "Part 5: PayPal Checkout in Action (3:00 – 3:45)",
            "visual": "User clicks 'Proceed with PayPal' on the selected Dell XPS 13. PayPal Sandbox checkout modal appears. Capture completes, order confirmation renders.",
            "narration": "\"Alex decides this 12-day trade-off is acceptable and confirms the purchase. Now watch the PayPal integration. AURA invokes the PayPal Orders v2 API with intent: CAPTURE. The official PayPal Sandbox modal launches. Notice that AURA adheres strictly to a user-in-the-loop philosophy—the AI never spends money autonomously without Alex's explicit authentication and approval. Alex logs into PayPal Sandbox, clicks 'Pay Now', and the order is instantly captured. The transaction is recorded in MongoDB, the emergency fund timeline updates in real time, and the PayPal webhook fires.\"",
            "action": "Click 'Proceed with PayPal'. In Sandbox modal, confirm purchase with test buyer credentials. Watch modal close, success banner appear, and dashboard balances automatically adjust.",
            "talking_point": "Real PayPal Orders v2 integration with strict user-in-the-loop spend control—no mocks, zero money at risk."
        },
        {
            "num": "Part 6: Merchant Hub & Order Tracking (3:45 – 4:15)",
            "visual": "Switch to Bruce Wayne's Merchant Hub. Real-time gross revenue counters, AG Grid transaction ledger, order fulfillment list with 'Mark as Shipped' button.",
            "narration": "\"Commerce is a two-sided marketplace, and AURA serves both sides. Switching over to our merchant session, Bruce Wayne, we enter the Merchant Hub. The purchase Alex just completed is already reflected in the real-time order ledger! Bruce can review the order details, generate a carrier tracking number, and click 'Fulfill Order'. This automatically triggers PayPal's Shipment Tracking API, injecting the tracking number into PayPal's ledger to protect both buyer and seller under PayPal Seller Protection.\"",
            "action": "Switch to Merchant view. Point out the new $899 order at the top of the list. Click 'Fulfill Order', entering tracking number 'USPS-9400100000000000000000'.",
            "talking_point": "End-to-end buyer-to-seller lifecycle powered by PayPal Shipment Tracking and webhook synchronization."
        },
        {
            "num": "Part 7: Under the Hood - Architecture & Multi-Agent Fleet (4:15 – 4:45)",
            "visual": "Display the high-resolution System Architecture Diagram (Figure 1), zooming through the 5 layers: Frontend, Orchestration, Astropods Fleet, Python ML, and External Services.",
            "narration": "\"Under the hood, AURA is powered by five tightly decoupled layers: a React 19 and AG Grid frontend, a Node.js orchestration engine, an autonomous fleet of six Astropods agents—including our financial planner, investment researcher, and shopping assistant—and a Python FastAPI predictive analytics microservice. Everything integrates with the PayPal Sandbox, Channel3, and MongoDB Atlas.\"",
            "action": "Pan smoothly over the 5 layers on the architecture diagram, highlighting the bidirectional flow between Gemini tool calls and PayPal REST endpoints.",
            "talking_point": "A multi-agent, enterprise-grade architecture engineered for deterministic tool execution."
        },
        {
            "num": "Part 8: The Vision & Close (4:45 – 5:00)",
            "visual": "Return to the AURA home dashboard, displaying the live application URL (aura-frontend-izl2.onrender.com) and concluding logo animation.",
            "narration": "\"We built AURA from scratch during an intense 12-day sprint. Our mission is to make intelligent commerce accessible and safe for everyone. Your money, your goals, your decisions. AURA is here to help you make them count. Thank you.\"",
            "action": "Show final slide/screen with GitHub repo link, live application link, and hackathon team credits.",
            "talking_point": "A memorable, judge-resonant closing emphasizing empowerment and financial agency."
        }
    ]

    for part in parts:
        story.append(Paragraph(part["num"], h1_style))

        table_data = [
            [Paragraph("<b>Visual</b>", label_style), Paragraph(part["visual"], cell_style)],
            [Paragraph("<b>Narration</b>", label_style), Paragraph(part["narration"], narration_style)],
            [Paragraph("<b>Action</b>", label_style), Paragraph(part["action"], cell_style)],
            [Paragraph("<b>Talking Point</b>", label_style), Paragraph(part["talking_point"], cell_style)]
        ]

        p_table = Table(table_data, colWidths=[80, 424])
        p_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#F8FAFC")),
            ('BOX', (0,0), (-1,-1), 1, c_border),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(p_table)
        story.append(Spacer(1, 4))

    doc.build(story, canvasmaker=DemoScriptCanvas)
    print(f"Demo Script PDF generated at: {pdf_path}")

if __name__ == "__main__":
    build_script_pdf()
