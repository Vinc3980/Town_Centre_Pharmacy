# Architecture

## Overview

Town Centre Pharmacy is a **modular monolith** designed for single-pharmacy operations with a clear path to multi-branch expansion. The backend is an API-only service that can be consumed by future mobile or third-party clients.

## System Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      HTTPS/WSS      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      Mongoose      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   React UI  â”‚ â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”‚   Express Backend   â”‚ â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”‚ MongoDB  â”‚
â”‚  (Vite SPA) â”‚   REST + Socket.IO   â”‚   (Node/TypeScript) â”‚                     â”‚          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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
town-centre-pharmacy/
â”œâ”€â”€ backend/
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ config/          # Environment config, DB connection
â”‚       â”œâ”€â”€ constants/       # App-wide constants (API_PREFIX, roles)
â”‚       â”œâ”€â”€ controllers/     # Request handlers (thin)
â”‚       â”œâ”€â”€ middleware/       # auth, permit, errorHandler, tenant, upload
â”‚       â”œâ”€â”€ models/          # Mongoose schemas & models (16 collections)
â”‚       â”œâ”€â”€ repositories/    # Data access layer
â”‚       â”œâ”€â”€ routes/          # Express routers per module
â”‚       â”œâ”€â”€ seed/            # Database seeder
â”‚       â”œâ”€â”€ services/        # Business logic
â”‚       â”œâ”€â”€ sockets/         # Socket.IO event handlers
â”‚       â”œâ”€â”€ types/           # TypeScript type definitions
â”‚       â”œâ”€â”€ utils/           # Logger, ApiError, permissions, helpers
â”‚       â”œâ”€â”€ validators/      # Zod validation schemas
â”‚       â””â”€â”€ __tests__/       # Backend tests
â”œâ”€â”€ frontend/
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ api/             # Axios instance, interceptors
â”‚       â”œâ”€â”€ app/             # Router config, query client
â”‚       â”œâ”€â”€ components/      # Shared/reusable UI components
â”‚       â”œâ”€â”€ context/         # React contexts
â”‚       â”œâ”€â”€ features/        # Domain-specific feature slices
â”‚       â”œâ”€â”€ hooks/           # Custom React hooks
â”‚       â”œâ”€â”€ layouts/         # Page layout shells
â”‚       â”œâ”€â”€ lib/             # Utility libraries
â”‚       â”œâ”€â”€ pages/           # Route-level page components
â”‚       â”œâ”€â”€ schemas/         # Zod schemas for frontend validation
â”‚       â”œâ”€â”€ services/        # API service functions
â”‚       â”œâ”€â”€ types/           # Frontend TypeScript types
â”‚       â”œâ”€â”€ utils/           # Frontend utilities
â”‚       â””â”€â”€ __tests__/       # Frontend tests
â”œâ”€â”€ docs/                    # Project documentation
â””â”€â”€ e2e/                     # End-to-end tests
```

## Data Flow

### Request Lifecycle

1. Client sends HTTP request â†’ Express receives it
2. **Global middleware** runs: Helmet (headers), CORS, body parsing, mongo-sanitize, rate limiting, logging (pino-http, morgan)
3. **Route-level middleware** runs: `requireAuth` (JWT verification) â†’ `requirePermission` (RBAC check)
4. **Controller** validates input using Zod schemas from `validators/`
5. **Service** executes business logic
6. **Repository** performs Mongoose operations against MongoDB
7. Response is serialized and returned (via `apiResponse` or `ApiError`)

### Authentication Flow

```
Login â†’ Verify credentials â†’ Issue access token (15m) + refresh token (7d)
  â†“
Request â†’ Bearer token in Authorization header â†’ requireAuth middleware verifies JWT
  â†“
Token expired â†’ POST /auth/refresh with refresh token â†’ New access token
```

### Real-time Flow

```
Socket.IO connection â†’ JWT handshake â†’ Join rooms (user, role)
  â†“
Sale created â†’ Emit 'sale:created' â†’ Dashboard updates live
  â†“
Notification created â†’ Emit to target roles â†’ In-app notification bell
```

## Key Design Decisions

- **Modular monolith**: Routes, controllers, services, and repositories are organized per domain (sales, inventory, users, etc.), making extraction to microservices straightforward
- **Repository pattern**: Data access is abstracted from business logic for testability and maintainability
- **RBAC with per-route permission checks**: Every protected endpoint declares required permissions via `requirePermission()` middleware
- **Batch-based inventory**: Medicines are tracked per-batch with expiry dates, enabling FEFO (First Expiry, First Out) stock management
- **Audit trail**: Every significant mutation logs to the `AuditLog` collection with before/after snapshots
