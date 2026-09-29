# Architecture

## Overview

Adom Pharmacy is a **modular monolith** designed for single-pharmacy operations with a clear path to multi-branch expansion. The backend is an API-only service that can be consumed by future mobile or third-party clients.

## System Architecture

```
┌─────────────┐      HTTPS/WSS      ┌─────────────────────┐      Mongoose      ┌──────────┐
│   React UI  │ ◄──────────────────► │   Express Backend   │ ◄─────────────────► │ MongoDB  │
│  (Vite SPA) │   REST + Socket.IO   │   (Node/TypeScript) │                     │          │
└─────────────┘                      └─────────────────────┘                     └──────────┘
```

## Backend Stack

| Layer            | Technology                                      |
|------------------|-------------------------------------------------|
| Runtime          | Node.js 20+, TypeScript 5.x                    |
| HTTP Framework   | Express 4.x                                     |
| Database         | MongoDB 6+ / Mongoose 8.x                       |
| Real-time        | Socket.IO 4.x                                   |
| Authentication   | JWT (access + refresh tokens via jsonwebtoken)  |
| Validation       | Zod 3.x                                         |
| Password Hashing | bcryptjs                                        |
| Logging          | Pino + pino-http + morgan                       |
| Security         | Helmet, CORS, express-rate-limit, express-mongo-sanitize |
| File Uploads     | Multer                                          |
| PDF Generation   | PDFKit                                          |
| Excel Export     | ExcelJS                                         |
| CSV Export       | csv-stringify                                   |
| Testing          | Vitest + Supertest                              |

## Frontend Stack

| Layer            | Technology                                      |
|------------------|-------------------------------------------------|
| Runtime          | Node.js 20+, TypeScript 5.x                    |
| UI Framework     | React 18.x                                      |
| Build Tool       | Vite 5.x                                        |
| Styling          | Tailwind CSS 3.x                                |
| Routing          | React Router 6.x                                |
| Data Fetching    | TanStack React Query 5.x                        |
| Forms            | React Hook Form 7.x + Zod resolvers             |
| HTTP Client      | Axios                                           |
| Charts           | Recharts                                        |
| Icons            | Lucide React                                    |
| Real-time        | socket.io-client                                |
| Testing          | Vitest + Testing Library (React + DOM)          |

## Directory Structure

```
adom-pharmacy/
├── backend/
│   └── src/
│       ├── config/          # Environment config, DB connection
│       ├── constants/       # App-wide constants (API_PREFIX, roles)
│       ├── controllers/     # Request handlers (thin)
│       ├── middleware/       # auth, permit, errorHandler, tenant, upload
│       ├── models/          # Mongoose schemas & models (16 collections)
│       ├── repositories/    # Data access layer
│       ├── routes/          # Express routers per module
│       ├── seed/            # Database seeder
│       ├── services/        # Business logic
│       ├── sockets/         # Socket.IO event handlers
│       ├── types/           # TypeScript type definitions
│       ├── utils/           # Logger, ApiError, permissions, helpers
│       ├── validators/      # Zod validation schemas
│       └── __tests__/       # Backend tests
├── frontend/
│   └── src/
│       ├── api/             # Axios instance, interceptors
│       ├── app/             # Router config, query client
│       ├── components/      # Shared/reusable UI components
│       ├── context/         # React contexts
│       ├── features/        # Domain-specific feature slices
│       ├── hooks/           # Custom React hooks
│       ├── layouts/         # Page layout shells
│       ├── lib/             # Utility libraries
│       ├── pages/           # Route-level page components
│       ├── schemas/         # Zod schemas for frontend validation
│       ├── services/        # API service functions
│       ├── types/           # Frontend TypeScript types
│       ├── utils/           # Frontend utilities
│       └── __tests__/       # Frontend tests
├── docs/                    # Project documentation
└── e2e/                     # End-to-end tests
```

## Data Flow

### Request Lifecycle

1. Client sends HTTP request → Express receives it
2. **Global middleware** runs: Helmet (headers), CORS, body parsing, mongo-sanitize, rate limiting, logging (pino-http, morgan)
3. **Route-level middleware** runs: `requireAuth` (JWT verification) → `requirePermission` (RBAC check)
4. **Controller** validates input using Zod schemas from `validators/`
5. **Service** executes business logic
6. **Repository** performs Mongoose operations against MongoDB
7. Response is serialized and returned (via `apiResponse` or `ApiError`)

### Authentication Flow

```
Login → Verify credentials → Issue access token (15m) + refresh token (7d)
  ↓
Request → Bearer token in Authorization header → requireAuth middleware verifies JWT
  ↓
Token expired → POST /auth/refresh with refresh token → New access token
```

### Real-time Flow

```
Socket.IO connection → JWT handshake → Join rooms (user, role)
  ↓
Sale created → Emit 'sale:created' → Dashboard updates live
  ↓
Notification created → Emit to target roles → In-app notification bell
```

## Key Design Decisions

- **Modular monolith**: Routes, controllers, services, and repositories are organized per domain (sales, inventory, users, etc.), making extraction to microservices straightforward
- **Repository pattern**: Data access is abstracted from business logic for testability and maintainability
- **RBAC with per-route permission checks**: Every protected endpoint declares required permissions via `requirePermission()` middleware
- **Batch-based inventory**: Medicines are tracked per-batch with expiry dates, enabling FEFO (First Expiry, First Out) stock management
- **Audit trail**: Every significant mutation logs to the `AuditLog` collection with before/after snapshots
