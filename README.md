# AI-VTON - E-Commerce Platform & Admin Dashboard

A modern, full-stack E-Commerce platform combining a **luxury customer-facing storefront**, a **comprehensive admin management dashboard**, automated **VietQR bank webhook reconciliation**, **MinIO S3 object storage**, and an **ARQ + Redis background job queue**.

---

## 📑 Table of Contents
- [Architecture Overview](#-architecture-overview)
- [Tech Stack](#-tech-stack)
- [Key Features](#-key-features)
- [Directory Structure](#-directory-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started & Installation](#-getting-started--installation)
  - [1. Start Docker Infrastructure](#1-start-docker-infrastructure)
  - [2. Setup & Run Backend](#2-setup--run-backend)
  - [3. Start ARQ Background Worker](#3-start-arq-background-worker)
  - [4. Setup & Run Frontend](#4-setup--run-frontend)
- [Default Seed Accounts](#-default-seed-accounts)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)

---

## 🏛 Architecture Overview

```
+-------------------------------------------------------------------------+
|                           CLIENT / BROWSER                              |
|   - Customer Storefront: http://localhost:3000/store                    |
|   - Admin Dashboard:     http://localhost:3000/dashboard                |
+------------------------------------+------------------------------------+
                                     |
                          REST API / HTTP Requests
                                     |
                                     v
+-------------------------------------------------------------------------+
|                        FASTAPI BACKEND (:8000)                          |
|   - Auth & Users (JWT Access + HttpOnly Refresh Token)                  |
|   - Products & Categories (Eager loading, S3 Storage)                   |
|   - Orders & Checkout Cart (Multi-item, Stock Reservation)              |
|   - Dashboard Analytics (KPIs, Low Stock, Recent Orders)                |
|   - VietQR Webhook Listener & Tracking Timeline                         |
+-------------+----------------------+--------------------+---------------+
              |                      |                    |
        SQLAlchemy ORM          Redis Message         S3 API
              |                    Queue                  |
              v                      v                    v
     +-----------------+    +-----------------+  +-----------------+
     |  MariaDB 11.2   |    |  Redis 7        |  |  MinIO Storage  |
     |  (Port: 3307)   |    |  (Port: 6379)   |  |  (Port: 9000)   |
     +-----------------+    +--------+--------+  +-----------------+
                                     |
                             Job Enqueue
                                     |
                                     v
                            +-----------------+
                            |  ARQ Worker     |
                            |  - Welcome Mail |
                            |  - Order Mail   |
                            |  - Payment Mail |
                            |  - Cron Expire  |
                            +-----------------+
```

---

## 💻 Tech Stack

### 🔹 Backend
- **Core Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+) with full asynchronous I/O (`async`/`await`).
- **Database & ORM**: 
  - **MariaDB 11.2** (MySQL dialect) via `pymysql` and `cryptography`.
  - **SQLAlchemy 2.0**: Eager loading to eliminate the N+1 query problem (`joinedload`, `selectinload`).
  - **Alembic**: Database schema migrations and revision control.
- **Asynchronous Task Queue & Scheduling**:
  - **ARQ** + **Redis 7**: Distributed non-blocking background queue for email dispatching and scheduled cron maintenance.
  - **aiosmtplib** + **Jinja2**: HTML email templating and async delivery.
- **Object Storage**:
  - **MinIO**: S3-compatible object storage service for high-performance product image uploads and downloads.
- **Security & Rate Limiting**:
  - **JWT (JSON Web Token)**: Short-lived access token (30 min) + Long-lived rotation refresh token (7 days) stored securely in `HttpOnly Cookie`.
  - **Passlib & Bcrypt**: Salted cryptographic password hashing.
  - **SlowAPI**: Redis-backed distributed rate limiting protecting `/login` and `/register` against brute-force attacks.

### 🔹 Frontend
- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/) + **React 19** + **TypeScript**.
- **UI & Styling**:
  - **Tailwind CSS v4** + **Radix UI** + **Shadcn UI**.
  - **Pastel Ocean Blue** luxury design system with dark/light mode switching via `next-themes`.
  - Micro-interactions and fluid animations powered by **Framer Motion (`motion/react`)**.
- **State Management & Data Fetching**:
  - **Axios** with automatic token interceptor and token refresh queue upon HTTP 401.
  - **SWR**: Client-side stale-while-revalidate caching and real-time syncing.
  - **React Hook Form** + **Zod**: Robust, type-safe schema validations.
  - **CartContext**: Persistent multi-item cart state management via browser `localStorage`.

---

## ✨ Key Features

### 🛒 1. Customer Storefront (`/store`)
- **Luxury Storefront Homepage**:
  - Hero section, trust badges, curated featured products, and newsletter CTAs.
  - **Advanced Filtering**: Multi-field fuzzy search (product name & description), category selection, Min/Max dual-slider price range filter, stock status toggles, and sorting options (price, creation date).
- **Quick View Modal**:
  - Instant product details overlay with high-resolution image galleries, star ratings, stock counts, and quick add-to-cart actions.
- **Product Reviews & Ratings**:
  - 1-to-5 star customer ratings, written reviews, and automated *Verified Purchase* verification.
- **Slide-over Cart Drawer**:
  - Persistent slide-out cart drawer accessible across all pages with real-time quantity increments/decrements, item removal, and auto-calculated totals.
- **Multi-Item Cart Checkout**:
  - Single-transaction checkout for multiple cart items via `/orders/checkout-cart`.
  - Supports **VietQR Bank Transfer** and **COD (Cash On Delivery)**.
- **Automated VietQR Payment & Webhook Reconciliation**:
  - Dynamic QR code generation containing bank ID, account number, amount, and order memo `LUXESTORE_{order_id}`.
  - **Automated Webhook**: The `/orders/vietqr-webhook` endpoint automatically receives incoming bank notifications, parses the order ID from payment descriptions, marks the order as `paid`, adjusts inventory, and enqueues confirmation emails.
- **Public Order Tracking Page**:
  - Real-time order progress tracking at `/store/orders/{id}` with an interactive 4-step timeline (Order Placed ➔ Payment Verified ➔ Processing & Packing ➔ Delivered) and on-screen VietQR payment info.
- **Standard Informational Subpages**:
  - Fully written subpages for About Us, Contact, Help Center, Careers, Blog, Press, Return Policy, Privacy Policy, Terms of Service, and Cookie Policy.

### 🛡️ 2. Admin Management Dashboard (`/dashboard`)
- **Executive Dashboard Overview**:
  - Real-time KPI metrics: Total Products, Active Catalog Items, Low-Stock Warnings (< 20 units remaining), Pending Orders, and Gross Revenue.
  - Interactive revenue and order status distribution charts.
  - Fast-action tables for recent transactions and low-stock replenishment alerts.
- **Product Catalog Management (`/products`)**:
  - Paginated table, search filters, modal-based CRUD operations, and drag-and-drop image upload to MinIO S3.
- **Category Management (`/categories`)**:
  - Full CRUD operations with auto-calculated linked product counts.
- **Order Management (`/orders`)**:
  - Centralized order oversight with status transitions (`pending`, `paid`, `cancelled`), audit timestamps, and automated stock reconciliation.
- **Customer Management (`/customers`)**:
  - User directory, search by name/email, and role-based permissions (`admin` / `customer`).

### ⚙️ 3. Inventory Locking & Background Worker
- **Stock Reservation Engine**:
  - Placing an order increments `reserved_quantity`, locking units without immediately decreasing total inventory, effectively preventing overselling.
  - Successful payment (`paid`) converts reserved units into `sold_quantity`.
  - Cancelled or expired orders automatically restore reserved quantities back to available stock.
- **ARQ Background Worker & Cron Jobs**:
  - `send_welcome_email_task`: Sends a branded welcome email upon user registration.
  - `send_order_confirmation_email_task`: Dispatches detailed invoice emails upon order creation.
  - `send_payment_received_email_task`: Confirms successful payment reconciliation.
  - Scheduled cron task running every minute to automatically expire unfulfilled `pending` orders older than 15 minutes.

---

## 📁 Directory Structure

```
AI-VTON/
├── docker-compose.yml              # MariaDB, Redis, MinIO, ARQ worker services
├── README.md                       # Comprehensive project documentation
├── backend/
│   ├── alembic/                    # Alembic database migration scripts
│   ├── app/
│   │   ├── core/                   # DB connection, JWT Security, Rate Limiter, Queue, Email
│   │   ├── features/               # Modular domain-driven features:
│   │   │   ├── users/              # Auth, profile, user management
│   │   │   ├── products/           # Catalog CRUD, image upload, reviews
│   │   │   ├── categories/         # Category CRUD
│   │   │   ├── orders/             # Multi-item checkout, VietQR, Webhook, tracking
│   │   │   └── dashboard/          # Analytics metrics, charts, low stock alerts
│   │   ├── integrations/           # MinIO client, VietQR generator, Paddle
│   │   ├── jobs/                   # Order expiration logic
│   │   ├── templates/              # Jinja2 HTML email templates
│   │   ├── main.py                 # FastAPI application entry point
│   │   ├── seed.py                 # Database seeder script
│   │   └── worker.py               # ARQ Worker settings & cron registrations
│   ├── requirements.txt            # Python dependencies
│   └── tests/                      # Pytest unit & integration test suite
└── frontend/
    ├── app/
    │   ├── store/                  # Customer Storefront (Home, Checkout, Tracking, Info)
    │   ├── dashboard/              # Admin Dashboard
    │   ├── products/               # Admin Products page
    │   ├── categories/             # Admin Categories page
    │   ├── orders/                 # Admin Orders page
    │   ├── customers/              # Admin Customers page
    │   ├── settings/               # Admin Settings page
    │   ├── login/ & register/      # Authentication pages
    │   └── layout.tsx              # Root Layout
    ├── components/                 # Reusable UI components & Radix UI primitives
    ├── lib/                        # Axios instance, SWR config, Types, Zod schemas
    └── tests/                      # Vitest frontend unit tests
```

---

## 📦 Prerequisites

- **Docker & Docker Compose** (to run MariaDB, Redis, MinIO)
- **Python 3.11+**
- **Node.js 18+** & **pnpm** (or npm)

---

## 🚀 Getting Started & Installation

### 1. Start Docker Infrastructure

Run the following command in the project root directory to start MariaDB, Redis, and MinIO:

```bash
docker-compose up -d mariadb redis minio
```

Verify that all containers are healthy:
```bash
docker ps
```
- **MariaDB**: port `3307`
- **Redis**: port `6379`
- **MinIO Console**: `http://localhost:9001` (Username: `admin` / Password: `password123`)

---

### 2. Setup & Run Backend

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Windows
   python -m venv .venv
   .venv\Scripts\activate

   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables (.env)**:
   Copy the provided `.env.example` template to `.env` and fill in your local credentials:
   ```bash
   cp .env.example .env
   ```
   > **Note**: Ensure you configure your own `SECRET_KEY`, `DATABASE_URL`, and VietQR banking details (`VIETQR_ACCOUNT_NO`, `VIETQR_BANK_ID`) in `.env`. Never commit your real `.env` file.


5. **Run Migrations & Seed Database**:
   ```bash
   # Apply database migrations
   alembic upgrade head

   # Seed default accounts and sample catalog
   python -m app.seed
   ```

6. **Start the FastAPI Backend Server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend API will be running at: `http://localhost:8000`

---

### 3. Start ARQ Background Worker

Open a new terminal session (with the virtual environment activated in `backend`):
```bash
cd backend
arq app.worker.WorkerSettings
```
> Alternatively, start the worker in Docker: `docker-compose up -d arq_worker`.

---

### 4. Setup & Run Frontend

1. **Open a new terminal and navigate to `frontend`**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   # Or: npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in `frontend/` (if not already present):
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

4. **Start the Next.js Development Server**:
   ```bash
   pnpm dev
   # Or: npm run dev
   ```
   The application will be running at: `http://localhost:3000`

---

## 🔑 Default Seed Accounts

After executing `python -m app.seed`, the following default test accounts are ready for use:

| Role | Email / Username | Password | Intended Usage |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@example.com` / `admin` | `Admin@123456` | Access `/dashboard`, manage products, categories, orders, and review analytics |
| **Demo Customer** | `user@example.com` / `demouser` | `User@123456` | Access `/store`, browse catalog, checkout with VietQR, submit verified reviews |

---

## 📖 API Documentation

FastAPI provides automated interactive documentation interfaces:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Primary Endpoint Groups:
- `/users`: Authentication, login, register, token refresh, profile updates, and admin user administration.
- `/products`: Catalog listing, multi-field search and filters, MinIO image upload, product reviews and ratings.
- `/categories`: Category CRUD and product associations.
- `/orders`: Multi-item cart checkout (`/checkout-cart`), order details, public order tracking (`/track/{id}`), and VietQR webhook reconciliation (`/vietqr-webhook`).
- `/dashboard`: High-level metrics, revenue stats, recent orders, and low-stock alerts.

---

## 🧪 Testing

### Backend Tests (Pytest)
The backend test suite runs against an isolated SQLite test database with automatic rollback:
```bash
cd backend
pytest -v
```

### Frontend Tests (Vitest)
Unit tests for React contexts, hooks, and UI interactions:
```bash
cd frontend
pnpm test
# Or: npm test
```

---

## 📄 License
This project is proprietary and developed for high-performance e-commerce operations.
All contributions and inquiries should be directed to the AI-VTON development team.
