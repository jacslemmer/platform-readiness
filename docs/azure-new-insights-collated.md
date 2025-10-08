# Azure Deployment: New Insights & Additions

**Date**: 2025-10-08
**Purpose**: Unique information from latest research not previously documented

---

## 🔥 CRITICAL: Mixed Content Error Solution

### Root Cause Identified
Your production frontend at `https://delightful-water-0995f8b0f.1.azurestaticapps.net` is blocked from calling backend at `http://time-tracker-app.eastus.azurecontainer.io:3001` because:

**Browser security policy**: HTTPS pages CANNOT make HTTP (insecure) requests

### Required Fixes (Priority Order)

1. **Backend MUST use HTTPS** - Configure Azure Container Instance/App Service with:
   - Custom domain with TLS certificate, OR
   - Azure-provided TLS (*.azurecontainer.io with HTTPS), OR
   - Place behind Azure Application Gateway/Front Door with TLS termination

2. **Update Frontend API URL** - Change from `http://` to `https://` in environment variables

3. **Alternative (Temporary)**: Use Azure Front Door to:
   - Accept HTTPS traffic from frontend
   - Route to HTTP backend internally (not recommended for production)

---

## New Azure-Specific Requirements

### Port Configuration (NEW)
- **App Service**: Listen on `process.env.PORT || 8080`
- **Container Apps**: Listen on `$PORT` environment variable
- **Critical**: App MUST bind to Azure-provided port dynamically
- **Startup time**: Must be <60 seconds

### Health Endpoints (UPDATED - More Specific)
- **Two distinct endpoints required**:
  1. `/health` - Basic liveness probe (returns 200 OK)
  2. `/ready` - Readiness probe (checks DB, cache, external dependencies)
- **Frequency**: Polled every 30-60 seconds
- **Timeout**: Must respond within 5 seconds
- **Failure threshold**: 3 consecutive failures = instance removed from load balancer

### Graceful Shutdown (NEW)
```javascript
// Required SIGTERM handler for zero-downtime deployments
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    // Close DB connections
    // Flush logs
    // Exit cleanly
    process.exit(0);
  });
});
```

### Logging Requirements (ENHANCED)
- **Destination**: stdout/stderr ONLY (not files)
- **Format**: Structured JSON recommended
- **No console.log in production**: Use proper logger (Winston, Bunyan, Pino)
- **Integration**: Automatically collected by Application Insights
- **Example**:
```javascript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  message: 'Request processed',
  requestId: req.id,
  duration: 125
}));
```

---

## MVP vs Production Requirements (NEW FRAMEWORK)

### MVP / Free-Tier Priorities (Top 10)
1. Azure Free Account ($200 credit)
2. Stateless design (no local storage)
3. Docker containerization
4. Environment variables for ALL config
5. Basic CI/CD with GitHub Actions
6. `/health` and `/ready` endpoints
7. Log to stdout/stderr
8. Pin dependency versions
9. Free App Service or Container App tier
10. **Cost alerts configured** (prevents bill shock)

### Production Must-Haves (Top 12)
1. **Infrastructure as Code** (Bicep/Terraform) in Git
2. CI/CD with build/test/security scans + deployment slots
3. **Key Vault + Managed Identity** (zero passwords in config)
4. Azure AD + RBAC least privilege
5. Application Insights + Log Analytics with **runbooks**
6. **Autoscale validated under load**
7. WAF + DDoS protection
8. **Backup/restore TESTED** (not just configured)
9. SLOs/SLAs with dashboards
10. **Azure Policy enforcement** (drift detection)
11. Cost governance (budgets, tagging, reservations)
12. **Operational runbooks + on-call rotations**

---

## Azure Container Registry (NEW)

### CI/CD Image Management
```yaml
# Build
docker build -t myregistry.azurecr.io/myapp:${GITHUB_SHA} .

# Push
echo ${AZURE_CR_PAT} | docker login myregistry.azurecr.io
docker push myregistry.azurecr.io/myapp:${GITHUB_SHA}

# Deploy
az containerapp update \
  --name myapp \
  --resource-group my-rg \
  --image myregistry.azurecr.io/myapp:${GITHUB_SHA}
```

**Key Requirements**:
- **Never use `latest` tag** - always use commit SHA or semantic version
- **Tag format**: `registry.azurecr.io/app:version`
- **Credentials**: Service Principal or Managed Identity

---

## Deployment Slots Deep Dive (ENHANCED)

### Swap with Preview (NEW PROCEDURE)
```bash
# Phase 1: Swap with preview
az webapp deployment slot swap \
  --name myapp \
  --resource-group my-rg \
  --slot staging \
  --target-slot production \
  --action preview

# Phase 2: Warm-up and validate
# (App runs with production config but in staging slot)
curl https://myapp-staging.azurewebsites.net/health

# Phase 3: Complete swap
az webapp deployment slot swap \
  --name myapp \
  --resource-group my-rg \
  --slot staging \
  --target-slot production \
  --action swap

# OR Cancel if issues found
az webapp deployment slot swap \
  --name myapp \
  --resource-group my-rg \
  --slot staging \
  --target-slot production \
  --action reset
```

**Benefits**:
- Zero-downtime deployment
- Rollback in seconds (just swap back)
- Test with production config before going live

### Slot-Specific Settings (NEW)
Mark settings as "slot setting" to prevent swap:
- Database connection strings (staging vs prod DB)
- Application Insights keys (separate telemetry)
- Feature flags (enable in staging first)

---

## Security Baseline Additions (NEW)

### Attack Surface Reduction
- **Disable remote debugging** (security risk)
- **Disable SCM basic auth** (use deployment tokens)
- **Disable FTP** (use FTPS or disable entirely)
- **Disable HTTP** (HTTPS only via Azure Policy)
- **Restrictive CORS**: Only allowed origins, enforce via policy

### RBAC Built-in Roles (NEW)
- **Owner**: Full access (avoid)
- **Contributor**: Manage resources but not access
- **Website Contributor**: Deploy apps, restart, but no settings change
- **Reader**: View only
- **Recommendation**: Use **custom roles** for least privilege

### Microsoft Defender for Cloud (NEW)
- **Enable Defender for App Service**
- **Threat detection**: SQL injection, XSS, malicious files
- **Anomaly detection**: Unusual resource usage
- **Compliance scanning**: CIS, PCI-DSS benchmarks
- **Cost**: ~$15/resource/month

---

## Reliability: RPO/RTO Targets (NEW)

### Recovery Objectives
- **RPO (Recovery Point Objective)**: Maximum acceptable data loss
  - Example: 1 hour = need hourly backups
- **RTO (Recovery Time Objective)**: Maximum acceptable downtime
  - Example: 15 minutes = need active-active with auto-failover

### Implementation
```
RTO < 1 hour:
  - Multi-region active-active
  - Azure Front Door with health probes
  - Geo-replicated database

RTO 1-4 hours:
  - Multi-region active-passive
  - Traffic Manager DNS failover
  - Database geo-replication with manual failover

RTO > 4 hours:
  - Single region with zone redundancy
  - Backup/restore process
```

---

## Autoscaling Specifics (ENHANCED)

### Recommended Triggers
- **CPU**: Scale out at **65%** (not 95% - need initialization time)
- **Memory**: Scale out at 70%
- **HTTP Queue Length**: >100 requests
- **Response Time P95**: >2 seconds

### Scale Rules
```json
{
  "scaleOut": {
    "threshold": 65,
    "duration": "5 minutes",
    "cooldown": "5 minutes",
    "addInstances": 2
  },
  "scaleIn": {
    "threshold": 30,
    "duration": "10 minutes",
    "cooldown": "10 minutes",
    "removeInstances": 1
  }
}
```

**Critical**: Always maintain **N+1 capacity** for zone failures

---

## Database Migration Automation (NEW)

### CI/CD Integration
```yaml
# Migration step in pipeline
- name: Run Database Migrations
  run: |
    # Entity Framework
    npm run migrate:prod

    # Flyway
    flyway migrate -url=$DB_URL -user=$DB_USER

    # Knex
    npx knex migrate:latest --env production
```

**Requirements**:
- Migrations must be **idempotent** (safe to run multiple times)
- Rollback migrations for each forward migration
- No data loss in rollback scenarios
- Test in staging slot first

---

## CORS Configuration Externalization (NEW)

**Problem**: Hardcoded CORS origins fail in multi-environment setups

**Solution**:
```javascript
// BAD - Hardcoded
app.use(cors({
  origin: 'https://myapp.com'
}));

// GOOD - Environment variable
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*'
}));
```

**Azure App Settings**:
```
CORS_ORIGINS=https://myapp.com,https://staging.myapp.com
```

**Azure Policy Enforcement**: Scan for hardcoded origins in code

---

## Monitoring & SLOs (ENHANCED)

### Key Metrics
1. **Availability**: % of successful health checks
   - Target: 99.9% (3 nines)
2. **Latency P95**: 95th percentile response time
   - Target: <500ms for API, <3s for pages
3. **Error Rate**: % of HTTP 5xx responses
   - Target: <0.1%
4. **Saturation**: CPU/Memory utilization
   - Target: <70% average, <90% peak

### Alert Configuration
```yaml
# High priority (page on-call)
- HTTP 5xx > 1% for 5 minutes
- Availability < 99% for 5 minutes
- CPU > 90% for 10 minutes

# Medium priority (ticket)
- P95 latency > 2s for 10 minutes
- Memory > 85% for 10 minutes

# Low priority (dashboard)
- Slow queries > 1s
- Cache miss rate > 50%
```

---

## Cost Optimization: New Strategies (NEW)

### Reservation Savings
- **1-year reservation**: 30-40% savings
- **3-year reservation**: 60-70% savings
- **Applies to**: Premium v3, Isolated tiers
- **Commitment**: Upfront payment

### Dev/Test Pricing
- **Requires**: Visual Studio subscription
- **Savings**: 40-60% on compute
- **Limitation**: Non-production only

### Scale-In During Off-Hours
```yaml
# Azure Automation Runbook
# Scale down to 1 instance at 6 PM
# Scale up to 3 instances at 6 AM
schedule:
  - cron: "0 18 * * *"
    action: scaleDown
    instances: 1
  - cron: "0 6 * * *"
    action: scaleUp
    instances: 3
```

---

## Compliance & Audit (NEW)

### Diagnostic Settings
- **Required**: Send logs to **centralized Log Analytics workspace**
- **Retention**: 30-90 days in Log Analytics
- **Long-term**: Export to Storage Account (cheaper)
- **SIEM Integration**: Azure Sentinel for security logs

### Azure Policy Examples
```
# Enforce HTTPS only
Microsoft.Web/sites/httpsOnly = true

# Require Managed Identity
Microsoft.Web/sites/identity != null

# Enforce minimum TLS version
Microsoft.Web/sites/siteConfig/minTlsVersion = "1.2"

# Require Application Insights
Microsoft.Web/sites/siteConfig/appInsights != null
```

---

## Operational Runbooks (NEW REQUIREMENT)

### Required Runbooks
1. **Deployment Failure**: Rollback procedure
2. **Database Connection Loss**: Failover steps
3. **High CPU Usage**: Investigation and mitigation
4. **Security Incident**: Isolation and forensics
5. **Disaster Recovery**: Multi-region failover

### Runbook Template
```markdown
# Runbook: [Incident Type]

## Detection
- Alert: [Alert name]
- Symptoms: [Observable issues]

## Triage
1. Check Application Insights dashboard
2. Verify health endpoint
3. Check Azure Service Health

## Mitigation
1. [Immediate action]
2. [Fallback action]
3. [Escalation point]

## Resolution
- Root cause: [Common causes]
- Permanent fix: [Long-term solution]

## Post-Incident
- Document in incident log
- Update runbook if process changed
```

---

## Azure Static Web Apps Specifics (NEW - For Your Frontend)

### Configuration
Your frontend at `delightful-water-0995f8b0f.1.azurestaticapps.net` needs:

1. **staticwebapp.config.json**:
```json
{
  "navigationFallback": {
    "rewrite": "/index.html"
  },
  "routes": [
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    }
  ],
  "globalHeaders": {
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  },
  "responseOverrides": {
    "404": {
      "rewrite": "/404.html"
    }
  }
}
```

2. **Environment Variables** (NOT in code):
```
VITE_API_URL=https://your-backend.azurewebsites.net
VITE_API_TIMEOUT=30000
```

3. **Build Configuration**:
```yaml
# GitHub Actions
build:
  appLocation: "frontend"
  apiLocation: ""  # No API in static site
  outputLocation: "dist"
```

---

## GitHub Actions: Enhanced Pipeline (NEW)

### Security Scanning Steps
```yaml
# Add to pipeline BEFORE deployment
- name: Security Audit
  run: npm audit --production --audit-level=high

- name: Dependency Check
  uses: dependency-check/Dependency-Check_Action@main

- name: SAST Scan
  uses: github/super-linter@v4
  env:
    VALIDATE_ALL_CODEBASE: false
```

### Deployment Gates
```yaml
# Require manual approval for production
environment:
  name: production
  protection-rules:
    - type: required-reviewers
      reviewers: ["@team-leads"]
    - type: wait-timer
      minutes: 10
```

---

## What Was Already Covered (SKIP)

The following were in your existing documentation from 2 days ago:
- ✅ Basic health check endpoints
- ✅ App Service tiers and pricing
- ✅ VNet integration and private endpoints
- ✅ Key Vault for secrets
- ✅ Application Insights basics
- ✅ Deployment slots overview
- ✅ HTTPS enforcement
- ✅ Managed Identity
- ✅ Zone redundancy
- ✅ Basic autoscaling
- ✅ No local file storage / SQLite
- ✅ ARR Affinity disable
- ✅ Custom domains and certificates

---

## Summary: Critical New Actions

### For Your Current Issue (Mixed Content Error)
1. ✅ **Backend MUST use HTTPS** - Configure Azure Container Instance with TLS
2. ✅ **Update frontend API URL** - Change `http://` to `https://` in env vars
3. ✅ **Test CORS** - Ensure backend allows frontend origin

### For Production Readiness (Not Yet Documented)
1. 📝 **Implement SIGTERM handler** for graceful shutdown
2. 📝 **Create `/ready` endpoint** (separate from `/health`)
3. 📝 **Switch to structured JSON logging** (stdout only)
4. 📝 **Test backup/restore procedure** (not just configure)
5. 📝 **Create operational runbooks** (5 minimum)
6. 📝 **Set up deployment slots with swap-with-preview**
7. 📝 **Configure Azure Policy enforcement**
8. 📝 **Establish RPO/RTO targets** and architect accordingly
9. 📝 **Implement database migrations in CI/CD**
10. 📝 **Set up security scanning in GitHub Actions**

---

**Generated**: 2025-10-08
**Source**: Collation of Azure PDFs + research data vs. existing platform-readiness docs
