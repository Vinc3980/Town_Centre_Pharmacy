# Deployment Guide

## Environment Variables

| Variable            | Required | Default                          | Description                         |
|---------------------|----------|----------------------------------|-------------------------------------|
| `NODE_ENV`          | No       | `development`                    | Set to `production` for live deploys |
| `PORT`              | No       | `5000`                           | Backend server port                 |
| `MONGODB_URI`       | Yes*     | `mongodb://localhost:27017/adom-pharmacy` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Yes*     | `dev-access-secret` (dev only)   | Secret for signing access tokens    |
| `JWT_REFRESH_SECRET`| Yes*     | `dev-refresh-secret` (dev only)  | Secret for signing refresh tokens   |
| `JWT_ACCESS_EXPIRES`| No       | `15m`                            | Access token lifetime               |
| `JWT_REFRESH_EXPIRES`| No      | `7d`                             | Refresh token lifetime              |
| `CORS_ORIGIN`       | No       | `http://localhost:5173`          | Allowed frontend origin             |

*Required in production — the app will refuse to start without them.

Generate secure secrets:
```bash
openssl rand -hex 64
```

## MongoDB Atlas Setup

### 1. Create a Cluster

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a new cluster (M0 free tier works for small deployments)
3. Select a region close to your users

### 2. Create a Database User

1. Go to **Database Access** → **Add New Database User**
2. Create a user with password authentication
3. Grant **Read/Write** access to the `adom-pharmacy` database

### 3. Whitelist IP Addresses

1. Go to **Network Access** → **Add IP Address**
2. Add your server's IP (or `0.0.0.0/0` for development only)

### 4. Get the Connection String

1. Go to **Database** → **Connect** → **Connect your application**
2. Copy the connection string
3. Replace `<password>` with your database user's password

```env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/adom-pharmacy?retryWrites=true&w=majority
```

### 5. Seed the Production Database

```bash
cd backend
MONGODB_URI="<production-uri>" npm run seed
```

> **Warning:** This wipes all existing data. Only run on fresh databases.

## Backend Deployment

### Option A: Railway / Render / Fly.io

1. Push code to GitHub
2. Create a new project on your platform
3. Set environment variables in the platform dashboard
4. Configure:
   - **Build command:** `cd backend && npm install && npm run build`
   - **Start command:** `cd backend && npm start`
   - **Port:** 5000 (or as configured)
5. Deploy

### Option B: VPS (DigitalOcean, AWS EC2, etc.)

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone the repository
git clone <your-repo-url> /opt/adom-pharmacy
cd /opt/adom-pharmacy

# 4. Install and build backend
cd backend
npm install
npm run build

# 5. Create a .env file
cat > .env << 'EOF'
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/adom-pharmacy?retryWrites=true&w=majority
JWT_ACCESS_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGIN=https://yourdomain.com
EOF

# 6. Start with PM2 (process manager)
npm install -g pm2
pm2 start dist/server.js --name adom-pharmacy-api
pm2 save
pm2 startup  # Follow instructions to auto-start on boot
```

### Option C: Docker

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 5000
CMD ["node", "dist/server.js"]
```

```bash
# Build and run
docker build -t adom-pharmacy-api ./backend
docker run -d \
  --name adom-api \
  -p 5000:5000 \
  --env-file backend/.env \
  adom-pharmacy-api
```

## Frontend Deployment

### Option A: Vercel (Recommended)

1. Push code to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Set the root directory to `frontend`
4. Configure environment variable:
   ```
   VITE_API_URL=https://api.adompharmacy.com/api/v1
   ```
5. Deploy

Vercel automatically handles:
- TypeScript compilation
- Vite build
- CDN distribution
- HTTPS
- Custom domains

### Option B: Netlify

1. Import repository on [netlify.com](https://netlify.com)
2. Build settings:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. Set environment variables
4. Add `_redirects` file in `frontend/public/`:
   ```
   /*  /index.html  200
   ```

### Option C: nginx

```bash
# 1. Build the frontend
cd frontend
VITE_API_URL=https://api.adompharmacy.com/api/v1 npm run build

# 2. Copy dist/ to nginx web root
sudo cp -r dist/* /var/www/adom-pharmacy/

# 3. Configure nginx
cat > /etc/nginx/sites-available/adom-pharmacy << 'EOF'
server {
    listen 80;
    server_name adompharmacy.com www.adompharmacy.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name adompharmacy.com www.adompharmacy.com;

    ssl_certificate /etc/letsencrypt/live/adompharmacy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/adompharmacy.com/privkey.pem;

    root /var/www/adom-pharmacy;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/adom-pharmacy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## CORS Configuration for Production

Set `CORS_ORIGIN` to your deployed frontend's exact URL:

```env
# If frontend is on Vercel
CORS_ORIGIN=https://adom-pharmacy.vercel.app

# If frontend is on custom domain
CORS_ORIGIN=https://adompharmacy.com
```

Do **not** use `*` as the CORS origin in production.

## HTTPS Setup

### Let's Encrypt (Free)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate and auto-configure nginx
sudo certbot --nginx -d adompharmacy.com -d www.adompharmacy.com

# Auto-renewal is set up by default; verify with:
sudo certbot renew --dry-run
```

### Cloudflare (Alternative)

1. Add your domain to Cloudflare
2. Enable proxy (orange cloud) for the domain
3. Set SSL mode to **Full (Strict)**
4. Enable **Always Use HTTPS**

## Domain Configuration

1. Purchase a domain (e.g., from Namecheap, Google Domains)
2. Point DNS to your hosting:
   - **Vercel:** Add CNAME record pointing to `cname.vercel-dns.com`
   - **VPS:** Add A record pointing to your server IP
   - **Cloudflare:** Add A or CNAME record, enable proxy
3. Update `CORS_ORIGIN` in your backend environment
4. Update `VITE_API_URL` in your frontend environment and redeploy

## Post-Deployment Checklist

- [ ] `NODE_ENV=production` is set
- [ ] JWT secrets are unique and secure (not the dev defaults)
- [ ] `MONGODB_URI` points to a production Atlas cluster
- [ ] `CORS_ORIGIN` matches the frontend URL exactly
- [ ] HTTPS is enabled and working
- [ ] Database is seeded with at least the owner account
- [ ] Rate limiting is active
- [ ] Logs are being collected (Pino → file or log aggregation service)
- [ ] MongoDB Atlas IP whitelist includes the server IP
- [ ] Error monitoring is configured (e.g., Sentry)
