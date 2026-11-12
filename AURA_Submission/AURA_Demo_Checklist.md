# AURA: Demo Video Recording Checklist & Contingency Guide

This checklist provides a structured, step-by-step protocol for recording the 3–5 minute hackathon demo video for **AURA** (PayPal + AI Hackathon 2026). Follow these instructions to ensure a seamless, professional presentation.

---

## 1. Pre-Recording Setup & Environment Preparation

### A. Display & Video Configuration
- [ ] **Display Resolution:** Set display to strictly **1920 × 1080 (1080p, 16:9)**.
- [ ] **OS Scaling:** Windows Display Scaling set to **100%** (avoids UI clipping or blurred text).
- [ ] **Browser Window:** Google Chrome maximized in Fullscreen (press `F11` or hide bookmarks/tab bars).
- [ ] **Zoom Level:** Chrome zoom set to **100%** (`Ctrl + 0`).
- [ ] **Extensions:** Use a dedicated Chrome Profile or Incognito window with all extensions, spellcheck red underlines, and password manager popups disabled.
- [ ] **Recording Software:** OBS Studio or Loom configured for **1080p @ 60 FPS**, bitrate ≥ 8000 Kbps.

### B. Audio Configuration
- [ ] **Microphone:** Dedicated USB or XLR microphone placed 6–8 inches from mouth with pop filter.
- [ ] **Noise Suppression:** Enable OBS noise gate / RNNoise suppression filter.
- [ ] **Audio Test:** Record a 15-second test clip; verify levels peak comfortably in the yellow zone (-12 dB to -6 dB).
- [ ] **Environment:** Close doors, mute computer notifications, turn off fans/AC.

### C. Live Services & Account Verification
- [ ] **Deployed Frontend:** Verify [https://aura-frontend-izl2.onrender.com](https://aura-frontend-izl2.onrender.com) loads smoothly.
- [ ] **Deployed Backend:** Verify [https://aura-backend-api-88nx.onrender.com/api/health](https://aura-backend-api-88nx.onrender.com/api/health) returns status 200.
- [ ] **Demo Personal Account:**
  - Email: `alex@aura-demo.finance`
  - Password: `AuraDemo#2026`
  - Status: Verify Emergency Fund goal is set to $3,200 / $5,000 and liquid cash is ~$4,250.
- [ ] **Demo Merchant Account:**
  - Email: `bruce_wayne@business.example.com`
  - Password: `BruceBusiness#2026`
  - Status: Verify Merchant Hub is accessible and transactions grid loads.
- [ ] **PayPal Sandbox Environment:**
  - Status: Check [developer.paypal.com](https://developer.paypal.com) status for sandbox operational health.
  - Sandbox Buyer Account: Have sandbox buyer email and password ready on clipboard or in a split window.

---

## 2. Step-by-Step Recording Flow (With Timestamp Targets)

| Timestamp | Phase | On-Screen Action | Talking Point Target |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:30** | **The Hook** | Start on AURA Dashboard. Hover over Emergency Fund goal bar ($3,200/$5,000) and Cash Balance ($4,250). | Introduce the core conflict: e-commerce wants impulse checkouts; personal finance wants discipline. AURA brings intelligence to the point of sale. |
| **0:30 – 1:00** | **The Problem** | Show brief split/cut of typical bank retroactive charts vs. 1-click checkout. | Explain why retroactive tracking fails and how consumers lack contextual guidance before they spend. |
| **1:00 – 1:45** | **Meet AURA** | Click the floating **Ask AURA** button in the bottom right corner. Toggle dark/light mode smoothly. | Present the 3 pillars: Google Gemini 3.1 Flash-Lite, Astropods 6-agent cloud fleet, and PayPal Sandbox APIs. |
| **1:45 – 3:00** | **Marquee Demo** | In Ask AURA, type: *"I want to buy a laptop for under $1,000."* Watch Channel3 product search and impact cards render. | Highlight the financial impact badge: *"Delays Emergency Fund by 12 days, fits discretionary budget."* |
| **3:00 – 3:45** | **PayPal Checkout** | Click *"Proceed with PayPal"* on Dell XPS 13 ($899). Complete checkout in Sandbox modal. | Emphasize strict **user-in-the-loop spend control**; AI recommends, user confirms. Watch balance adjust instantly. |
| **3:45 – 4:15** | **Merchant Hub** | Switch session to Bruce Wayne (`bruce_wayne@business.example.com`). Open Merchant Hub. Order appears instantly. | Demonstrate two-sided marketplace. Click *"Fulfill Order"* with tracking number to trigger PayPal Shipment Tracking API. |
| **4:15 – 4:45** | **Under the Hood** | Switch to the high-res System Architecture diagram (`AURA_Architecture.png`). Pan through the 5 layers. | Explain separation of concerns: React 19 frontend, Node orchestrator, 6 Astropods agents, Python ML, PayPal Sandbox rails. |
| **4:45 – 5:00** | **Vision & Close** | Return to AURA Home with deployed link on screen. Deliver closing statement. | Conclude with: *"Your money, your goals, your decisions. AURA is here to help you make them count."* |

---

## 3. Contingency & Fallback Protocol

### Fallback 1: PayPal Sandbox Latency / Timeout
- **Symptom:** The PayPal Sandbox modal spins for > 8 seconds or returns a 504 Gateway error.
- **Immediate Action:**
  1. Do not panic on camera. Maintain steady narration explaining: *"In sandbox environments, PayPal rate-limits mock authentication."*
  2. Switch to a pre-recorded 15-second screen capture of a successful PayPal Sandbox authorization modal (`assets/fallback_paypal_checkout.mp4`).
  3. Resume live demo immediately once the order completion screen is reached.

### Fallback 2: Channel3 API Search Latency
- **Symptom:** Live merchant scraping takes longer than 3 seconds to return laptop options.
- **Immediate Action:**
  1. Ask AURA incorporates cached fallbacks for standard demo queries (`laptop under $1000`, `headphones`, `desk monitor`).
  2. If network fails completely, Ask AURA automatically pulls from the pre-warmed offline catalog, preserving the exact same financial impact badges and PayPal checkout buttons.

### Fallback 3: Live Service Restart (Render Free Tier Cold Start)
- **Symptom:** Backend API on Render takes ~30 seconds to wake up if inactive.
- **Prevention:** Run `curl https://aura-backend-api-88nx.onrender.com/api/health` 5 minutes prior to recording to ensure the container is warm and responsive.

---

## 4. Post-Recording Quality Checklist
- [ ] Total video duration is between **3:30 and 4:55**.
- [ ] No personal passwords, API keys, or browser bookmarks visible.
- [ ] PayPal Sandbox "SANDBOX" yellow banner is clearly visible during checkout to demonstrate authentic testing.
- [ ] Audio is crisp and balanced with no clipping or audible breathing.
- [ ] Video renders cleanly without frame drops.
