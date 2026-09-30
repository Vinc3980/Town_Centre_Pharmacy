# Town Centre Pharmacy Management System

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
- **Reports & Analytics** - Sales, inventory, expenses, profit, staff performance, stock movements, expiry, low-stock, daily summaries, purchases â€” exportable to CSV, Excel, PDF
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
cd town-centre-pharmacy

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
| Admin | admin@towncentrepharmacy.gh | Admin123! | Full access (all permissions) |
| Branch Manager | manager@towncentrepharmacy.gh | Manager123! | Full access |
| Staff | staff@towncentrepharmacy.gh | Staff123! | Dashboard, sales, reports |

## Project Structure

```
town-centre-pharmacy/
â”œâ”€â”€ backend/                  Express + TypeScript API
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ config/           Environment, database connection
â”‚   â”‚   â”œâ”€â”€ controllers/      Route handlers (15 controllers)
â”‚   â”‚   â”œâ”€â”€ middleware/        Auth, error handling, file uploads
â”‚   â”‚   â”œâ”€â”€ routes/           Versioned routers (/api/v1/*)
â”‚   â”‚   â”œâ”€â”€ services/         Business logic (audit, notifications, tokens)
â”‚   â”‚   â”œâ”€â”€ validators/       Zod schemas
â”‚   â”‚   â”œâ”€â”€ utils/            Logger, response formatting, money utils
â”‚   â”‚   â”œâ”€â”€ types/            Shared TypeScript types
â”‚   â”‚   â”œâ”€â”€ constants/        App constants, roles, permissions
â”‚   â”‚   â””â”€â”€ sockets/          Socket.IO event handlers
â”‚   â”œâ”€â”€ prisma/               Schema + migrations (PostgreSQL)
â”‚   â”œâ”€â”€ Dockerfile
â”‚   â””â”€â”€ package.json
â”œâ”€â”€ frontend/                 React + Vite SPA
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ app/              Router & app shell
â”‚   â”‚   â”œâ”€â”€ components/       Reusable UI components
â”‚   â”‚   â”œâ”€â”€ layouts/          Page layouts
â”‚   â”‚   â”œâ”€â”€ pages/            Route pages
â”‚   â”‚   â”œâ”€â”€ features/         Feature modules (POS, inventory, reports...)
â”‚   â”‚   â”œâ”€â”€ hooks/            Custom React hooks
â”‚   â”‚   â”œâ”€â”€ services/         Business logic
â”‚   â”‚   â”œâ”€â”€ api/              Axios API clients
â”‚   â”‚   â”œâ”€â”€ context/          React context providers
â”‚   â”‚   â”œâ”€â”€ types/            TypeScript types
â”‚   â”‚   â”œâ”€â”€ schemas/          Zod validation schemas
â”‚   â”‚   â””â”€â”€ utils/            Helpers
â”‚   â”œâ”€â”€ Dockerfile
â”‚   â””â”€â”€ package.json
â”œâ”€â”€ docs/                     Documentation
â”‚   â”œâ”€â”€ openapi.yaml          OpenAPI 3.0 specification
â”‚   â”œâ”€â”€ api.md                API reference
â”‚   â”œâ”€â”€ architecture.md       System architecture
â”‚   â”œâ”€â”€ database.md           Database schema
â”‚   â”œâ”€â”€ deployment.md         Deployment guide
â”‚   â”œâ”€â”€ development.md        Development guide
â”‚   â”œâ”€â”€ security.md           Security documentation
â”‚   â”œâ”€â”€ admin-manual.md       Admin user manual
â”‚   â””â”€â”€ user-manual.md        End-user manual
â”œâ”€â”€ e2e/                      Playwright E2E tests
â”œâ”€â”€ docker-compose.yml        Backend + frontend Docker setup
â””â”€â”€ package.json              Root scripts (dev, build, test)
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
docker build -t town-centre-pharmacy-backend .
docker run -p 5000:5000 --env-file .env town-centre-pharmacy-backend

# Frontend only
cd frontend
docker build -t town-centre-pharmacy-frontend .
docker run -p 80:80 town-centre-pharmacy-frontend
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

Private â€” Town Centre Pharmacy
