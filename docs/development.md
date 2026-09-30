# Development Guide

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 9+ or **yarn** 1.22+
- **MongoDB** 6+ (local instance or MongoDB Atlas)
- **Git**

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd town-centre-pharmacy
```

### 2. Install Dependencies

```bash
# Root (if workspace scripts exist)
npm install

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Configure Environment Variables

```bash
# From the root directory
cp .env.example backend/.env
```

Edit `backend/.env` with your values:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/town-centre-pharmacy
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGIN=http://localhost:5173
```

> **Note:** In development, JWT secrets fall back to insecure defaults with a console warning. Always set them explicitly.

### 4. Seed the Database

```bash
cd backend
npm run seed
```

This wipes existing data and creates:

| Data              | Count     |
|-------------------|-----------|
| Users             | 6 (one per role) |
| Categories        | 7         |
| Suppliers         | 3         |
| Medicines         | ~66 (with generic/strength variants) |
| Medicine Batches  | ~100      |
| Customers         | 24        |
| Sales             | ~80 (over 20 days) |
| Expenses          | 12        |
| Notifications     | 3         |
| Audit Logs        | 2         |

### 5. Start Development Servers

```bash
# Terminal 1 â€” Backend (port 5000)
cd backend
npm run dev

# Terminal 2 â€” Frontend (port 5173)
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

## Available Scripts

### Backend (`backend/`)

| Command           | Description                          |
|-------------------|--------------------------------------|
| `npm run dev`     | Start backend with hot-reload (nodemon + ts-node) |
| `npm run build`   | Compile TypeScript to `dist/`        |
| `npm start`       | Run compiled backend                 |
| `npm run seed`    | Seed database with demo data         |
| `npm run lint`    | Run ESLint on `src/`                 |
| `npm run lint:fix`| Auto-fix lint issues                 |
| `npm run format`  | Format code with Prettier            |
| `npm run format:check` | Check formatting without writing |
| `npm test`        | Run tests with Vitest                |

### Frontend (`frontend/`)

| Command           | Description                          |
|-------------------|--------------------------------------|
| `npm run dev`     | Start Vite dev server                |
| `npm run build`   | Type-check + production build        |
| `npm run preview` | Preview production build locally     |
| `npm run lint`    | Run ESLint                           |
| `npm run format`  | Format code with Prettier            |
| `npm test`        | Run tests with Vitest                |
| `npm run test:watch` | Run tests in watch mode           |

## Database Setup

### Local MongoDB

1. Install MongoDB Community Edition
2. Start the service: `mongod` or via your OS service manager
3. Connection string: `mongodb://localhost:27017/town-centre-pharmacy`

### MongoDB Atlas (Cloud)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a database user
3. Whitelist your IP address
4. Get the connection string and set it as `MONGODB_URI`

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/town-centre-pharmacy?retryWrites=true&w=majority
```

## Demo Accounts

After seeding, use these credentials:

| Role               | Email                          | Password       |
|--------------------|--------------------------------|----------------|
| Owner              | owner@towncentrepharmacy.gh          | Owner123!      |
| Branch Manager     | manager@towncentrepharmacy.gh        | Manager123!    |
| Pharmacist         | pharmacist@towncentrepharmacy.gh     | Pharma123!     |
| Cashier            | cashier@towncentrepharmacy.gh        | Cashier123!    |
| Inventory Officer  | inventory@towncentrepharmacy.gh      | Inventory123!  |
| Auditor            | auditor@towncentrepharmacy.gh        | Auditor123!    |

## Testing

### Backend Tests

```bash
cd backend
npm test
```

Tests use Vitest and Supertest for HTTP endpoint testing.

### Frontend Tests

```bash
cd frontend
npm test          # Single run
npm run test:watch  # Watch mode
```

Tests use Vitest with Testing Library for React component testing.

## Project Conventions

- **Code Style**: Prettier for formatting, ESLint for linting
- **TypeScript**: Strict mode enabled; avoid `any`
- **Imports**: Use path aliases where configured; otherwise relative imports
- **Naming**: Files use PascalCase for components/models, camelCase for utilities
- **Validation**: Zod schemas validate all external input (request bodies, query params)
- **Errors**: Use `ApiError` class for structured error responses
- **Logging**: Use Pino logger (`logger.info()`, `logger.error()`) â€” never `console.log` in production code
