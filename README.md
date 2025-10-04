# Platform Readiness

A web application to test AI-generated wrapper applications for cloud platform deployment readiness and automatically port them to target platforms.

## Features

- **GitHub Integration**: Fetch and analyze applications directly from GitHub repositories
- **Platform Readiness Testing**: Detect compatibility issues for Cloudflare Workers and Microsoft Azure
- **Automated Porting**: Generate patches to convert applications for target platforms
- **Smart Analysis**: Identifies issues with databases, storage, runtime, and configurations
- **Downloadable Patches**: Get git patches to apply platform-specific changes

## Project Structure

```
platform-readiness/
├── frontend/              # React + TypeScript (Cloudflare Pages)
├── backend/               # Cloudflare Workers + Hono
├── test-apps/             # Platform-agnostic test applications
│   └── platform-agnostic-app/   # Express + SQLite test app
└── README.md
```

## Tech Stack

**Frontend:**
- React + TypeScript
- Vite
- Deployed on Cloudflare Pages

**Backend:**
- Cloudflare Workers
- Hono (lightweight web framework)
- D1 (SQLite database)
- R2 (object storage)
- KV (caching)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Installation

1. Install dependencies:
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

2. Set up Cloudflare resources:
```bash
# Create D1 database
wrangler d1 create platform-readiness-db

# Create R2 bucket
wrangler r2 bucket create platform-readiness-repos

# Create KV namespace
wrangler kv:namespace create CACHE
```

3. Update `backend/wrangler.toml` with your resource IDs

4. Initialize D1 database:
```bash
cd backend
wrangler d1 execute platform-readiness-db --file=schema.sql
```

### Development

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

The frontend will proxy API requests to the backend at `http://localhost:8787`.

### Deployment

**Backend (Cloudflare Workers):**
```bash
cd backend
npm run deploy
```

**Frontend (Cloudflare Pages):**
```bash
cd frontend
npm run build
# Deploy the `dist` folder to Cloudflare Pages
```

## How It Works

1. **User Input**: Enter a GitHub repository URL and select target platform (Cloudflare or Azure)
2. **Analysis**: The tool fetches the repository and runs platform-specific checks
3. **Results**: Displays readiness status and lists any compatibility issues
4. **Porting**: If not ready, generates a downloadable patch with all necessary changes
5. **Apply**: User applies the patch to their repository

## Supported Platforms

- **Cloudflare Workers**: Checks for Express.js, SQLite, local storage, port bindings
- **Microsoft Azure**: Checks for deployment configs, start scripts, persistent storage
- *Extensible to AWS, GCP, and others*

## Testing

A platform-agnostic test application is included in `test-apps/platform-agnostic-app/`. This Express + TypeScript app intentionally uses incompatible features (SQLite, local storage) to test the porting logic.
