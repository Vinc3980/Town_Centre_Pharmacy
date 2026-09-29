# Adom Pharmacy Management System

Production-grade pharmacy management platform supporting multi-branch operations, FEFO inventory, point-of-sale, prescriptions, daily cash sessions, and real-time analytics. Built for extensibility to mobile and customer-facing applications.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Axios, React Hook Form, Zod, Recharts, Lucide React, Socket.IO Client |
| **Backend** | Node.js, TypeScript, Express, Prisma ORM, JWT (access + refresh), bcrypt, Zod validation, Socket.IO, Pino logger |
| **Database** | PostgreSQL 17 (native install; Prisma migrations) |
| **Testing** | Vitest, Supertest, React Testing Library, Playwright (E2E) |
| **Docs** | OpenAPI 3.0 / Swagger |
| **DevOps** | Docker, Docker Compose, Nginx |

## Features

- **Point of Sale** - FEFO inventory deduction, split payments (cash, mobile money, card, bank transfer), held/resumed sales, discount authorization
- **Inventory Management** - Batch-level tracking, expiry warnings, low-stock alerts, stock adjustments with audit trail, barcode lookup
- **Multi-Branch Support** - Branch-level data isolation, per-branch settings
- **Role-Based Access Control** - Three roles (admin, branch manager, staff) with granular permissions
- **Daily Cash Sessions** - Opening float, session close with cash variance calculation, end-of-day report submission and approval workflow
- **Refund Workflow** - Manager approval required, partial/full refunds, resaleable vs. damaged item tracking
- **Expense Tracking** - Category-based expenses with receipt upload, approval workflow
- **Reports & Analytics** - Sales, inventory, expenses, profit, staff performance, stock movements, expiry, low-stock, daily summaries, purchases — exportable to CSV, Excel, PDF
- **Dashboard** - Revenue trends, payment breakdowns, top medicines, sales by staff/category, inventory alerts, real-time activity feed
- **Real-Time Updates** - Socket.IO for live sale notifications, inventory changes, staff login/logout
- **Audit Trail** - Every significant action logged with before/after snapshots
- **Notifications** - In-app alerts for low stock, expiring medicines, refunds, daily reports
- **Security** - Account lockout, JWT rotation, password policies, rate limiting, Helmet headers

## Quick Start

### Prerequisites

- Node.js >= 18
- PostgreSQL 17 (local native install)
- npm or yarn

### Clone & Install

```bash
git clone <repo-url>
cd adom-pharmacy

# Install all dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Environment Setup

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
NODE_ENV=development
PORT=5000
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://user:password@localhost:5432/adom_pharmacy
```

### Database Setup

```bash
cd backend
npx prisma migrate deploy   # apply schema migrations
```

The database schema lives in `backend/prisma/schema.prisma`. Data was migrated from the legacy MongoDB dataset (the pre-migration backup is stored outside the repo).

### Run Development Servers

```bash
# Both frontend and backend concurrently
npm run dev

# Or individually:
cd backend && npm run dev    # API at http://localhost:5000
cd frontend && npm run dev   # UI at http://localhost:5173
```

## Demo Accounts

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| Admin | admin@adompharmacy.gh | Admin123! | Full access (all permissions) |
| Branch Manager | manager@adompharmacy.gh | Manager123! | Full access |
| Staff | staff@adompharmacy.gh | Staff123! | Dashboard, sales, reports |

## Project Structure

```
adom-pharmacy/
├── backend/                  Express + TypeScript API
│   ├── src/
│   │   ├── config/           Environment, database connection
│   │   ├── controllers/      Route handlers (15 controllers)
│   │   ├── middleware/        Auth, error handling, file uploads
│   │   ├── routes/           Versioned routers (/api/v1/*)
│   │   ├── services/         Business logic (audit, notifications, tokens)
│   │   ├── validators/       Zod schemas
│   │   ├── utils/            Logger, response formatting, money utils
│   │   ├── types/            Shared TypeScript types
│   │   ├── constants/        App constants, roles, permissions
│   │   └── sockets/          Socket.IO event handlers
│   ├── prisma/               Schema + migrations (PostgreSQL)
│   ├── Dockerfile
│   └── package.json
├── frontend/                 React + Vite SPA
│   ├── src/
│   │   ├── app/              Router & app shell
│   │   ├── components/       Reusable UI components
│   │   ├── layouts/          Page layouts
│   │   ├── pages/            Route pages
│   │   ├── features/         Feature modules (POS, inventory, reports...)
│   │   ├── hooks/            Custom React hooks
│   │   ├── services/         Business logic
│   │   ├── api/              Axios API clients
│   │   ├── context/          React context providers
│   │   ├── types/            TypeScript types
│   │   ├── schemas/          Zod validation schemas
│   │   └── utils/            Helpers
│   ├── Dockerfile
│   └── package.json
├── docs/                     Documentation
│   ├── openapi.yaml          OpenAPI 3.0 specification
│   ├── api.md                API reference
│   ├── architecture.md       System architecture
│   ├── database.md           Database schema
│   ├── deployment.md         Deployment guide
│   ├── development.md        Development guide
│   ├── security.md           Security documentation
│   ├── admin-manual.md       Admin user manual
│   └── user-manual.md        End-user manual
├── e2e/                      Playwright E2E tests
├── docker-compose.yml        Backend + frontend Docker setup
└── package.json              Root scripts (dev, build, test)
```

## Docker Setup

### Quick Start with Docker Compose

```bash
# Set environment variables
export DATABASE_URL=postgres://user:password@host:5432/adom_pharmacy
export JWT_ACCESS_SECRET=your-access-secret-min-32-chars
export JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars

# Build and start all services
docker compose up -d
```

This starts two containers (the database runs as a native PostgreSQL service):

| Service | Port | Description |
|---------|------|-------------|
| `pharmacy-backend` | 5000 | Express API server |
| `pharmacy-frontend` | 80 | Nginx serving the React SPA |

### Individual Docker Builds

```bash
# Backend only
cd backend
docker build -t adom-pharmacy-backend .
docker run -p 5000:5000 --env-file .env adom-pharmacy-backend

# Frontend only
cd frontend
docker build -t adom-pharmacy-frontend .
docker run -p 80:80 adom-pharmacy-frontend
```

## Development Commands

| Command | Location | Description |
|---------|----------|-------------|
| `npm run dev` | root | Start both frontend and backend |
| `npm run build` | root | Build both for production |
| `npm run test` | root | Run all tests |
| `npm run dev` | backend | Start API with hot-reload |
| `npm run build` | backend | Compile TypeScript |
| `npm start` | backend | Run compiled server |
| `npm run lint` | backend | ESLint check |
| `npm run format` | backend | Prettier format |
| `npm run dev` | frontend | Vite dev server |
| `npm run build` | frontend | Production build |
| `npm run preview` | frontend | Preview production build |
| `npm run lint` | frontend | ESLint check |

## Deployment

### Frontend (Vercel / Netlify)

```bash
cd frontend
npm run build
# Deploy the dist/ folder
```

Set the API base URL environment variable for production.

### Backend (Render / Railway / AWS)

```bash
cd backend
npm run build
npm start
```

Ensure the following environment variables are set in your hosting provider:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgres://user:password@host:5432/adom_pharmacy
JWT_ACCESS_SECRET=<secure-random-string>
JWT_REFRESH_SECRET=<secure-random-string>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGIN=https://your-frontend-domain.com
```

### Database

Use a managed PostgreSQL service (or the native local install) in production. Set `DATABASE_URL` accordingly and apply migrations with `npx prisma migrate deploy`.

## API Documentation

Full OpenAPI 3.0 specification is available at [`docs/openapi.yaml`](docs/openapi.yaml).

Key endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Authenticate and get tokens |
| GET | `/api/v1/dashboard` | Dashboard summary |
| GET | `/api/v1/medicines` | List medicines with stock |
| POST | `/api/v1/sales` | Process a POS sale |
| GET | `/api/v1/reports/profit` | Profit & loss report |
| GET | `/api/v1/health` | API health check |

## License

Private — Adom Pharmacy
