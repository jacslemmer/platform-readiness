# Time Tracker Azure Deployment - Lessons Learned

**Date:** 2025-10-08
**Project:** Time Tracker Application
**Deployment:** Azure Container Instance + Azure Static Web Apps

---

## Executive Summary

Successfully deployed a full-stack time tracking application to Azure after resolving multiple production issues. The application is functional but has known limitations around database persistence and timer stop functionality.

**Total Time:** ~6 hours of debugging and deployment
**Cost Impact:** $0 additional (used free Cloudflare Tunnel instead of Azure HTTPS solutions)

---

## Architecture Overview

### Current Setup
```
Frontend (Azure Static Web Apps - HTTPS)
    ↓
Cloudflare Tunnel (FREE HTTPS wrapper)
    ↓
Backend (Azure Container Instance - HTTP)
    ↓
PostgreSQL (in same container - EPHEMERAL)
```

### Components
- **Frontend:** React + TypeScript → Azure Static Web Apps
- **Backend:** Node.js + Express → Azure Container Instance
- **Database:** PostgreSQL (containerized, no persistence)
- **HTTPS:** Cloudflare Tunnel (free tier)
- **Container Registry:** Azure Container Registry

---

## Critical Issues Encountered & Solutions

### 1. Mixed Content Error ❌ → ✅
**Problem:**
- HTTPS frontend tried to call HTTP backend
- Browser security blocked all API requests
- Error: "Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'"

**Root Cause:**
- Azure Container Instances don't support native HTTPS
- Browser enforces HTTPS → HTTPS communication only

**Solutions Evaluated:**
| Solution | Cost | Complexity | Status |
|----------|------|------------|--------|
| Azure Front Door | ~$35/month | Low | ❌ Too expensive |
| Application Gateway | ~$125/month | Medium | ❌ Too expensive |
| Azure App Service | ~$13-55/month | Medium | ❌ Quota issues |
| **Cloudflare Tunnel** | **FREE** | **Low** | **✅ IMPLEMENTED** |

**Implementation:**
```bash
# Download cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz -o cloudflared.tgz
tar -xzf cloudflared.tgz
chmod +x cloudflared

# Start tunnel (HTTP2 protocol for better compatibility)
./cloudflared tunnel --url http://time-tracker-app.eastus.azurecontainer.io:3001 --protocol http2
```

**Important Notes:**
- ⚠️ Cloudflare Tunnel URL regenerates on each restart (temporary tunnels)
- ⚠️ Frontend needs to be rebuilt and redeployed when tunnel URL changes
- ✅ Application 100% hosted in Azure (only traffic routing via Cloudflare)

---

### 2. CORS Errors ❌ → ✅
**Problem:**
- Frontend at `https://delightful-water-0995f8b0f.1.azurestaticapps.net` blocked by CORS
- Backend only allowed `http://localhost:5173`

**Solution:**
Updated backend CORS configuration to allow multiple origins:

```typescript
// backend/src/index.functional.ts
const getCorsOrigin = (): string | string[] => {
  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    return envOrigin.includes(',') ? envOrigin.split(',').map(o => o.trim()) : envOrigin;
  }
  // Default allowed origins
  return [
    'http://localhost:5173',
    'https://delightful-water-0995f8b0f.1.azurestaticapps.net'
  ];
};
```

**Testing:**
```bash
curl -I -H "Origin: https://delightful-water-0995f8b0f.1.azurestaticapps.net" \
  https://your-tunnel-url.trycloudflare.com/health

# Should return:
# access-control-allow-origin: https://delightful-water-0995f8b0f.1.azurestaticapps.net
# access-control-allow-credentials: true
```

---

### 3. Type Conversion Errors (toFixed) ❌ → ✅
**Problem:**
- `TypeError: e.toFixed is not a function`
- PostgreSQL numeric/decimal types returned as strings
- Frontend tried to call `.toFixed()` on strings

**Root Cause:**
PostgreSQL NUMERIC/DECIMAL fields can be returned as strings when values are large or precise.

**Solution:**
Updated utility functions to handle both string and number types:

```typescript
// frontend/src/utils/timeFormat.ts
export const formatCurrency = (amount: number | string): string => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `R ${numAmount.toFixed(2)}`;
};

export const getBudgetStatus = (billing: number, budget: number | string): 'normal' | 'warning' | 'danger' => {
  const numBudget = typeof budget === 'string' ? parseFloat(budget) : budget;
  const percentage = (billing / numBudget) * 100;
  if (percentage >= 100) return 'danger';
  if (percentage >= 80) return 'warning';
  return 'normal';
};
```

---

### 4. Database Tables Not Initialized ❌ → ✅
**Problem:**
- `relation 'projects' does not exist` error
- Database schema never created

**Solution:**
Backend has an initialization endpoint:

```bash
# Initialize database tables
curl -X POST https://your-tunnel-url.trycloudflare.com/api/init \
  -H "Content-Type: application/json"

# Response: {"message":"Database initialized successfully"}
```

**Schema Created:**
- `users` table (UUID, email, password_hash)
- `projects` table (id, user_id, name, hourly_rate, budget, timer fields)
- `time_entries` table (id, project_id, user_id, seconds, timestamps)
- Indexes for performance
- Triggers for updated_at timestamps

---

### 5. Timer Stop Functionality ❌ → ⚠️ PARTIAL
**Problem:**
- "Timer is not running" error when trying to stop active timer
- PostgreSQL BIGINT `start_time` returned as string instead of number

**Attempted Solution:**
```typescript
// backend/src/services/projectService.ts
TE.chain((project) => {
  // Convert start_time to number if it's a string (from PostgreSQL)
  const startTime = typeof project.start_time === 'string'
    ? parseInt(project.start_time, 10)
    : project.start_time;

  if (!project.is_running || !startTime) {
    console.error('Timer stop validation failed:', {
      is_running: project.is_running,
      start_time: project.start_time,
      start_time_type: typeof project.start_time
    });
    return TE.left(validationError('Timer is not running'));
  }

  return TE.right({ ...project, start_time: startTime });
})
```

**Current Status:**
⚠️ Fix deployed but not fully tested
**Workaround:** Refresh the page to stop timer (resets state)

---

### 6. Database Persistence ❌ → 🔄 KNOWN LIMITATION
**Problem:**
- PostgreSQL runs inside the same container as Node.js backend
- Container restarts wipe all data (users, projects, time entries)

**Impact:**
- Every container restart requires:
  1. Database reinitialization (`/api/init`)
  2. User re-registration
  3. All previous data lost

**Why This Happens:**
- Container Instance uses ephemeral storage
- No mounted volumes or persistent storage configured
- PostgreSQL data directory is wiped on restart

**Solutions & Costs:**

| Solution | Cost/Month | Pros | Cons |
|----------|-----------|------|------|
| **Current (ephemeral)** | $0 | Free, simple | Data loss on restart |
| **Azure Database for PostgreSQL** | $12-15 | Fully managed, backups | Additional cost |
| **Azure File Share mount** | ~$0.50 | Very cheap | Complex setup |

**Recommendation:**
- **Development/Testing:** Keep current setup (free)
- **Production:** Upgrade to Azure Database for PostgreSQL (~$12-15/month)

---

## Deployment Process

### Frontend Deployment
```bash
cd frontend

# Update environment variables
echo "VITE_API_URL=https://your-tunnel-url.trycloudflare.com/api" > .env.local

# Build
npm run build

# Deploy to Azure Static Web Apps
npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token $(az staticwebapp secrets list \
    --name time-tracker-app \
    --resource-group time-tracker-rg \
    --query "properties.apiKey" -o tsv) \
  --env production
```

### Backend Deployment
```bash
cd backend

# Build TypeScript
npm run build

# Build and push Docker image using Azure Container Registry
az acr build \
  --registry timetrackerregistry \
  --image time-tracker-backend:latest \
  --file Dockerfile .

# Restart container to pull new image
az container restart \
  --name time-tracker-app \
  --resource-group time-tracker-rg
```

### Database Initialization
```bash
# After any container restart
curl -X POST https://your-tunnel-url.trycloudflare.com/api/init \
  -H "Content-Type: application/json"
```

---

## Application URLs

- **Frontend:** https://delightful-water-0995f8b0f.1.azurestaticapps.net
- **Backend (direct, HTTP only):** http://time-tracker-app.eastus.azurecontainer.io:3001
- **Backend (via Cloudflare, HTTPS):** https://[dynamic-url].trycloudflare.com
- **Container Registry:** timetrackerregistry.azurecr.io

---

## Cost Breakdown

### Current Monthly Costs
- **Azure Container Instance:** ~$5-10/month (1 CPU, 1.5GB RAM)
- **Azure Static Web Apps:** FREE (Free tier)
- **Azure Container Registry:** FREE (Basic tier, <1GB)
- **Cloudflare Tunnel:** FREE
- **Total:** ~$5-10/month

### Future Costs (with managed database)
- Current costs: ~$5-10/month
- Azure Database for PostgreSQL: +$12-15/month
- **New Total:** ~$17-25/month

---

## Known Issues & Workarounds

### 1. Timer Stop Not Working
**Issue:** Clicking "Stop" shows "Timer is not running" error
**Workaround:** Refresh the page (saves state and stops timer)
**Status:** Code fix deployed but needs verification

### 2. Database Wiped on Container Restart
**Issue:** All data lost when container restarts
**Workaround:** Run `/api/init` endpoint after restart, re-register users
**Status:** Requires architecture change (persistent database)

### 3. Cloudflare Tunnel URL Changes
**Issue:** Tunnel URL regenerates on each restart
**Workaround:** Update frontend `.env.local` and redeploy
**Status:** Would need permanent tunnel (requires Cloudflare account)

---

## Testing Checklist

Before marking deployment as complete:

- [x] Frontend loads via HTTPS
- [x] User can register
- [x] User can login
- [x] User can create project
- [x] Timer starts and counts up
- [ ] Timer stops correctly (workaround: refresh page)
- [x] Project displays hourly rate, budget, billing
- [x] No CORS errors in console
- [x] No Mixed Content errors
- [ ] Database persists across restarts (requires upgrade)

---

## Environment Variables

### Frontend (`frontend/.env.local`)
```bash
VITE_API_URL=https://your-tunnel-url.trycloudflare.com/api
```

### Backend (Azure Container Instance)
```bash
# Set via Azure Portal or CLI
POSTGRES_DB=timetracker
POSTGRES_USER=pgadmin
POSTGRES_PASSWORD=TimeTrack2025!Secure
PORT=3001
NODE_ENV=production
```

---

## Lessons Learned

### What Went Well ✅
1. **Cloudflare Tunnel saved money** - Free HTTPS instead of $35-125/month
2. **Azure Container Registry builds** - No need for local Docker
3. **Database initialization endpoint** - Easy to reset schema
4. **CORS configuration** - Supports multiple origins cleanly
5. **Type-safe frontend** - TypeScript caught many issues early

### What Could Be Improved 🔄
1. **Database persistence** - Should use managed database from start
2. **Health monitoring** - Need proper health checks and alerts
3. **Logging** - Should use Azure Application Insights
4. **Error handling** - Some 500 errors lack detail
5. **Documentation** - Should have started with deployment docs

### Key Takeaways 💡
1. **Azure Container Instances don't support HTTPS** - Plan for this upfront
2. **Browser security is strict** - Mixed Content errors will block everything
3. **PostgreSQL types need handling** - Numeric fields can be strings in JavaScript
4. **Container restarts wipe data** - Always use persistent storage for databases
5. **Free tools exist** - Cloudflare Tunnel saved significant costs

---

## Next Steps

### Immediate (Before Production)
1. [ ] Verify timer stop functionality works after latest deployment
2. [ ] Set up persistent database (Azure Database for PostgreSQL)
3. [ ] Configure permanent Cloudflare Tunnel (or Azure Front Door if budget allows)
4. [ ] Add health monitoring and alerts
5. [ ] Implement proper logging (Azure Application Insights)

### Future Enhancements
1. [ ] Auto-scaling for Container Instance
2. [ ] Backup/restore procedures
3. [ ] CI/CD pipeline (GitHub Actions)
4. [ ] Performance monitoring
5. [ ] Security audit (secrets management, network rules)

---

## Useful Commands

### Check Container Status
```bash
az container show \
  --name time-tracker-app \
  --resource-group time-tracker-rg \
  --query "containers[0].instanceView.currentState"
```

### View Container Logs
```bash
az container logs \
  --name time-tracker-app \
  --resource-group time-tracker-rg
```

### Check Static Web App Settings
```bash
az staticwebapp appsettings list \
  --name time-tracker-app \
  --resource-group time-tracker-rg
```

### Test Backend Health
```bash
curl https://your-tunnel-url.trycloudflare.com/health
```

---

## Support & Troubleshooting

### Common Errors

**Error:** "Failed to fetch"
**Cause:** CORS or Mixed Content
**Fix:** Check CORS headers, verify HTTPS tunnel is running

**Error:** "relation 'projects' does not exist"
**Cause:** Database not initialized
**Fix:** `curl -X POST https://your-tunnel-url.trycloudflare.com/api/init`

**Error:** "Timer is not running"
**Cause:** Type conversion issue with PostgreSQL BIGINT
**Fix:** Refresh page to stop timer (workaround)

**Error:** "Login failed" (HTTP 500)
**Cause:** Container restarted, database wiped
**Fix:** Reinitialize database, re-register user

---

## References

- [Azure Container Instances Documentation](https://learn.microsoft.com/en-us/azure/container-instances/)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Azure Static Web Apps Documentation](https://learn.microsoft.com/en-us/azure/static-web-apps/)
- [Mixed Content MDN Reference](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-08
**Maintained By:** Development Team
