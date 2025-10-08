# 🚨 AZURE DEPLOYMENT - START HERE

**Last Updated**: 2025-10-08
**Cost of Ignoring**: $$$$ (3 days of debugging and Azure charges)

---

## ⚡ CRITICAL: Before ANY Azure Work

**YOU MUST READ THESE TWO DOCUMENTS** in this exact order:

### 1. [docs/azure-new-insights-collated.md](./docs/azure-new-insights-collated.md) ⚠️ READ FIRST
**Contains production-critical requirements learned through painful debugging:**
- Mixed Content error solution (HTTPS frontend → HTTP backend fails)
- Port binding requirements (process.env.PORT)
- Health endpoint specifications (/health + /ready)
- SIGTERM handler for graceful shutdown
- Logging requirements (stdout/stderr only, structured JSON)
- RPO/RTO targets
- Operational runbooks
- Container registry best practices
- Deployment slot procedures

### 2. [docs/azure-app-service-checklist.md](./docs/azure-app-service-checklist.md) 📋 COMPREHENSIVE CHECKLIST
**89-item checklist with:**
- **Section 0: CRITICAL BLOCKERS** (9 items - FIX THESE FIRST)
- Configuration & Deployment
- Reliability & High Availability
- Security
- Storage & Data
- Monitoring & Observability
- Performance Optimization
- Operational Excellence
- Cost Optimization
- Disaster Recovery

---

## 🔥 The Problem We Solved (Oct 8, 2025)

**Symptom**: Frontend at `https://delightful-water-0995f8b0f.1.azurestaticapps.net` showed "Failed to fetch" in production

**Root Cause**: Mixed Content Error
- HTTPS frontend tried to call HTTP backend at `http://time-tracker-app.eastus.azurecontainer.io:3001`
- Browser security blocks HTTPS pages from making HTTP requests
- **This is not an Azure bug - it's browser security policy**

**Solution**: Backend MUST use HTTPS (see docs for 3 implementation options)

---

## 🎯 Quick Start: Fixing Your Broken Deployment

### Step 1: Fix Critical Blockers (DO NOT SKIP)

Run this checklist on your app:

```bash
# 1. Mixed Content
[ ] Backend uses HTTPS (not HTTP)
[ ] Frontend API URL env var uses https://

# 2. Port Binding
[ ] App listens on process.env.PORT || 8080 (not hardcoded port)

# 3. Health Endpoints
[ ] GET /health returns 200 {"status":"healthy"}
[ ] GET /ready checks DB/cache and returns 200 or 503

# 4. Graceful Shutdown
[ ] process.on('SIGTERM', ...) handler implemented

# 5. Logging
[ ] Logs go to stdout/stderr (not files)
[ ] Structured JSON format (not raw console.log)
```

### Step 2: Verify Configuration Files

```bash
# package.json
[ ] "engines": {"node": ">=18.0.0"}
[ ] "start": "node server.js" in scripts

# Frontend (.env or Azure Static Web App settings)
[ ] VITE_API_URL=https://your-backend.azurewebsites.net
[ ] NOT hardcoded in code

# Backend
[ ] No .env file in deployment
[ ] Connection strings from process.env
```

### Step 3: Deploy & Test

```bash
# 1. Deploy to staging slot (not production)
# 2. Run smoke tests
# 3. Check /health and /ready endpoints
# 4. Verify HTTPS frontend → HTTPS backend works
# 5. Swap staging → production
```

---

## 📚 Why This Documentation Exists

**Timeline of Pain:**
- Day 1: Deployed to Azure, Mixed Content error appeared
- Day 2: Tried multiple fixes, racked up Azure costs
- Day 3: Finally did proper research, found root causes
- Day 4 (today): Documented everything so this NEVER happens again

**Cost**: 3 days + unnecessary Azure charges + frustration

**Lessons Learned:**
1. Azure is unforgiving - if you miss critical requirements, it fails silently or with cryptic errors
2. Browser security policies (Mixed Content) are not Azure-specific but WILL break your deployment
3. Port binding, health endpoints, and graceful shutdown are NOT optional
4. Research upfront saves money and time

---

## 🛠️ Common Azure Deployment Errors & Solutions

### Error: "Failed to fetch" in frontend console
**Cause**: Mixed Content (HTTPS → HTTP)
**Fix**: Enable HTTPS on backend OR use Application Gateway

### Error: Container starts but is unreachable
**Cause**: Wrong port binding (hardcoded instead of process.env.PORT)
**Fix**: Change to `app.listen(process.env.PORT || 8080)`

### Error: Health checks failing, instances terminating
**Cause**: Missing /health or /ready endpoints
**Fix**: Add both endpoints, ensure <5 second response time

### Error: Dropped connections during deployment
**Cause**: No SIGTERM handler for graceful shutdown
**Fix**: Add `process.on('SIGTERM', () => { server.close(); })`

### Error: Can't debug production issues
**Cause**: Logs written to files (ephemeral file system) or not structured
**Fix**: Log to stdout/stderr with JSON format

---

## 🔗 External Resources

**Official Microsoft Docs:**
- [Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/service-guides/app-service-web-apps)
- [App Service Best Practices](https://learn.microsoft.com/en-us/azure/app-service/app-service-best-practices)
- [Container Apps Documentation](https://learn.microsoft.com/en-us/azure/container-apps/)

**Browser Security:**
- [MDN: Mixed Content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)

---

## ✅ Deployment Readiness Checklist (TL;DR)

**Before you deploy to Azure, ensure:**

1. ✅ Backend uses HTTPS (not HTTP)
2. ✅ Frontend API URL is https:// (in env var, not code)
3. ✅ App listens on `process.env.PORT`
4. ✅ `/health` endpoint exists and returns 200
5. ✅ `/ready` endpoint exists and checks dependencies
6. ✅ SIGTERM handler for graceful shutdown
7. ✅ Logs to stdout/stderr as structured JSON
8. ✅ No .env file in deployment (use App Settings)
9. ✅ No local file storage (use Blob Storage)
10. ✅ Connection strings from environment variables

**If you skip ANY of these, you WILL have production issues.**

---

## 🆘 Getting Help

**Before asking for help:**
1. Read [azure-new-insights-collated.md](./docs/azure-new-insights-collated.md)
2. Check [azure-app-service-checklist.md](./docs/azure-app-service-checklist.md) Section 0
3. Verify you've implemented all 10 critical items above

**When asking for help, provide:**
- Error message (exact text)
- Browser console screenshot
- Azure resource type (App Service, Container App, Static Web App)
- Whether backend uses HTTP or HTTPS
- Port binding code snippet

---

**Remember**: Azure doesn't care about your deadlines. It will fail if you don't meet its requirements. Do the research upfront, follow this documentation, and save yourself days of debugging.

**This documentation cost 3 days to create through trial and error. Use it wisely.**
