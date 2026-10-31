# Brightloop

> Modern, decimal-safe subscription management, billing, and recurring revenue analytics platform built with FastAPI and React.

---

## Overview

**Brightloop** is a high-performance B2B subscription billing and finance operations platform designed for recurring revenue businesses. It provides subscription lifecycle automation, exact invoice accounting without floating-point rounding errors, role-based customer portals, real-time finance analytics (MRR/ARR/Aging), and a grounded AI Finance Assistant supporting OpenAI and Google Gemini.

---

## Key Features

* **Exact Decimal-Safe Financial Math:** All monetary quantities are stored strictly as integer cents (`*_cents`) and rates as basis points (`*_bps`, e.g., 850 = 8.5%). Eliminates floating-point drift across invoicing, discounts, taxes, and payments.
* **Subscription Lifecycle & Automated Billing:**
  * Supports `draft`, `quotation`, `confirmed`, `active`, and `closed` subscription lifecycles.
  * Recurring billing schedules across multiple periods: `monthly`, `yearly`, `weekly`, and `daily`.
  * Automated billing runs with duplicate invoice prevention and automated `next_billing_date` advancement.
* **Invoicing & Cash Collection:**
  * Confirmed and draft invoices with balance tracking and due-date calculation.
  * Payment recording (Card, Bank Transfer, ACH, Cash) with partial payment handling and overpayment prevention.
  * Overdue invoice detection and automated dunning recovery workflows.
* **Granular Role-Based Access Control (RBAC):**
  * **ADMIN:** Full analytics dashboard, forecast projections, company settings, staff management, and plan catalog control.
  * **STAFF:** Operations dashboard, quotation creation, customer onboarding, payment recording, and overdue follow-ups.
  * **CUSTOMER:** Self-service portal strictly scoped to the customer's own subscriptions, open invoices, and payment receipts.
* **Executive Financial Analytics & Forecasting:**
  * Real-time metrics: Monthly Recurring Revenue (MRR), Annual Run Rate (ARR), Period Collections, and Total Outstanding.
  * Interactive Recharts visualizations: Revenue Trends, Subscription Growth, Invoice Status breakdown, Revenue by Plan, and Overdue Aging buckets.
  * 6-month predictive revenue forecast model based on normalized run rates and actual payments history.
* **Grounded AI Finance Assistant:**
  * Configurable with **OpenAI** (`gpt-4o-mini`) or **Google Gemini** (`gemini-2.5-flash`).
  * Answers are grounded entirely in a read-only, role-scoped JSON snapshot of MongoDB records.
  * Zero hallucinations: if a metric is not present in the authorized record snapshot, the assistant honestly reports it as unavailable.
  * Strict customer privacy: customers can never query or view other customers' data.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite 6, Tailwind CSS v4, TanStack Query (React Query), Recharts, Lucide Icons |
| **Backend** | Python 3.12+, FastAPI, Uvicorn, Motor (AsyncIO MongoDB driver), Pydantic v2, HTTPX |
| **Database** | MongoDB Atlas / MongoDB 6.0+ |
| **Testing** | Pytest, Mongomock Motor, AnyIO, Vitest / TypeScript Compiler (`tsc`) |

---

## Project Structure

```text
brightloop/
└── app/
    ├── backend/
    │   ├── lib/                  # Core helpers: auth, billing, database, dates, money, security
    │   ├── models/               # Pydantic data schemas: auth, billing, catalog, system
    │   ├── routers/              # FastAPI route controllers
    │   │   ├── auth.py           # Session authentication & password verification
    │   │   ├── customers.py      # Customer profile management
    │   │   ├── subscriptions.py  # Subscription lifecycle & change requests
    │   │   ├── invoices.py       # Invoice generation & balance tracking
    │   │   ├── payments.py       # Payment recording & receipt verification
    │   │   ├── reports.py        # Financial KPIs, aging charts, and revenue forecast
    │   │   ├── ai.py             # Grounded AI assistant (OpenAI & Gemini)
    │   │   └── ...
    │   ├── tests/                # Automated pytest test suites
    │   ├── seed.py               # Non-destructive demo dataset seeder
    │   ├── server.py             # FastAPI application entry point & lifespan manager
    │   └── .env                  # Backend environment configuration
    │
    └── frontend/
        ├── src/
        │   ├── components/       # UI primitives, charts, dialogs, and app shell layout
        │   ├── lib/              # API client, session management, formatters, and TypeScript types
        │   ├── pages/            # View pages (Dashboard, Subscriptions, Invoices, Reports, Assistant, etc.)
        │   ├── App.tsx           # Router and top-level query provider
        │   └── main.tsx          # Application mount entry point
        ├── package.json          # Node dependencies and scripts
        ├── tsconfig.json         # TypeScript compiler configuration
        └── vite.config.ts        # Vite build & proxy configuration
```

---

## Getting Started

### Prerequisites

* **Node.js** 18+ and **npm** 9+
* **Python** 3.10+
* **MongoDB** (Local instance or MongoDB Atlas connection URI)

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Configure environment variables in `backend/.env`:
   ```env
   # Database connection
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/brightloop?retryWrites=true&w=majority
   DB_NAME=brightloop

   # AI Assistant (choose either or both)
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini

   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash

   # Optional provider override ('openai' or 'gemini')
   AI_PROVIDER=gemini
   ```

4. Populate realistic demo records (non-destructive):
   ```bash
   python seed.py
   ```

5. Start the backend development server:
   ```bash
   uvicorn server:app --reload --port 8000
   ```
   The API will be live at `http://localhost:8000`. API documentation is available at `http://localhost:8000/docs`.

---

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Demo Accounts

The seed script initializes three accounts for testing role-based workflows:

| Role | Email | Password | Permissions & Access Scope |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@brightloop.io` | `Bright@Loop1` | Full administrative access, Finance Reports, Forecast, Settings, User Management |
| **STAFF** | `staff@brightloop.io` | `Staff@Loop1` | Operations dashboard, Quotations, Invoices, Subscriptions, Customer Accounts |
| **CUSTOMER** | `sara@novatek.io` | `Customer@1` | Self-service portal scoped strictly to Novatek's subscriptions, invoices, and payments |

---

## Running Tests

### Backend Unit & Integration Tests

Run the full pytest suite (covering financial calculations, subscription lifecycle, RBAC isolation, reports, and AI context grounding):

```bash
python -m pytest backend/tests -v
```

### Frontend TypeScript Verification & Build

Verify TypeScript typing and create an optimized production build:

```bash
cd frontend
npm run build
```

---

## Security & Architecture Highlights

* **No Exposed Credentials:** API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `MONGODB_URI`) are strictly loaded server-side and never returned in API payloads or sent to the client.
* **Hardened Customer Scoping:** Customer principals are strictly pinned to their `customer_id` via server-side dependencies (`customer_filter`). Any request attempting to query another customer's ID returns HTTP 404 (denial of existence) rather than leaking metadata.
* **Deterministic Rounding:** Invoice math enforces deterministic half-up integer rounding on positive values, ensuring exact repeatability across billing cycles.

