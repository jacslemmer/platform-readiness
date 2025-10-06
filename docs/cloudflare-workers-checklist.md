# Cloudflare Workers Production Readiness Checklist

This comprehensive checklist is compiled from official Cloudflare Workers documentation (2025).

**Sources:**
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/
- https://developers.cloudflare.com/workers/observability/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/configuration/

---

## 1. Configuration Requirements

### 1.1 Essential Configuration Files
- [ ] **wrangler.toml exists** - Required for deployment
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Create wrangler.toml with minimum required fields

- [ ] **name field defined** - Worker name
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (derive from package.json or repo name)
  - **Action**: Add `name = "worker-name"` to wrangler.toml

- [ ] **main field defined** - Entry point (optional for assets-only Workers)
  - **Severity**: ERROR (except assets-only)
  - **Auto-fixable**: Yes (detect from package.json or file structure)
  - **Action**: Add `main = "src/index.ts"` to wrangler.toml

- [ ] **compatibility_date set to current date** - Required
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Add `compatibility_date = "YYYY-MM-DD"` with current date

### 1.2 Compatibility Configuration
- [ ] **compatibility_date is recent** (within 6 months)
  - **Severity**: WARNING
  - **Auto-fixable**: Yes
  - **Action**: Update compatibility_date to recent date

- [ ] **Required compatibility flags set** - Based on dependencies
  - **Severity**: ERROR/WARNING (depends on usage)
  - **Auto-fixable**: Yes
  - **Action**: Add required flags like `nodejs_compat` if Node.js APIs used

---

## 2. Runtime Compatibility

### 2.1 Framework Compatibility
- [ ] **No Express.js usage** - Not compatible with Workers runtime
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (migrate to Hono)
  - **Action**: Replace Express with Hono or other Workers-compatible framework

- [ ] **No native Node.js modules without polyfills** - Limited Node.js support
  - **Severity**: ERROR
  - **Auto-fixable**: Partial (add nodejs_compat flag, may require code changes)
  - **Action**: Add `compatibility_flags = ["nodejs_compat"]` or refactor code

- [ ] **No port binding (.listen())** - Workers don't bind to ports
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Export default handler instead of app.listen()

### 2.2 Runtime Limits Compliance
- [ ] **Worker size under 10 MB** (compressed, Paid) or 3 MB (Free)
  - **Severity**: ERROR
  - **Auto-fixable**: No (requires manual optimization)
  - **Action**: Reduce bundle size through tree-shaking, code splitting

- [ ] **Global scope executes within 400ms** - Startup time limit
  - **Severity**: ERROR
  - **Auto-fixable**: No (requires code optimization)
  - **Action**: Move heavy initialization to lazy loading

- [ ] **CPU time limit appropriate** - Max 300,000ms (5 min)
  - **Severity**: WARNING
  - **Auto-fixable**: No (architectural decision)
  - **Action**: Consider splitting long-running tasks

---

## 3. Storage & Data

### 3.1 Database Compatibility
- [ ] **No SQLite usage** - Not compatible with Workers
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (migrate to D1)
  - **Action**: Replace sqlite3 with D1 binding and SQL queries

- [ ] **D1 database binding configured** (if database needed)
  - **Severity**: ERROR (if DB required)
  - **Auto-fixable**: Yes
  - **Action**: Add D1 binding to wrangler.toml

- [ ] **D1 database size under 10 GB** - Platform limit
  - **Severity**: ERROR
  - **Auto-fixable**: No
  - **Action**: Archive or migrate data if exceeds limit

### 3.2 Storage Solutions
- [ ] **No local file system (fs) usage** - Not available in Workers
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (migrate to R2)
  - **Action**: Replace fs operations with R2 bucket operations

- [ ] **No multer or file upload to disk** - Use R2 instead
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Replace multer with direct R2 upload

- [ ] **R2 bucket binding configured** (if object storage needed)
  - **Severity**: ERROR (if storage required)
  - **Auto-fixable**: Yes
  - **Action**: Add R2 binding to wrangler.toml

- [ ] **KV namespace binding configured** (if key-value storage needed)
  - **Severity**: WARNING (if caching/sessions needed)
  - **Auto-fixable**: Yes
  - **Action**: Add KV binding to wrangler.toml

### 3.3 External Service Limits
- [ ] **Subrequests under 1,000 per invocation** - Platform limit
  - **Severity**: ERROR
  - **Auto-fixable**: No (requires architectural changes)
  - **Action**: Batch requests or redesign data flow

---

## 4. Environment & Secrets

### 4.1 Environment Variables
- [ ] **No sensitive data in wrangler.toml vars** - Security risk
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (migrate to secrets)
  - **Action**: Move sensitive values to secrets

- [ ] **Secrets configured for production** - API keys, tokens, etc.
  - **Severity**: ERROR
  - **Auto-fixable**: No (manual via wrangler secret put)
  - **Action**: Document required secrets, provide setup instructions

- [ ] **Environment variables under 128 (Paid) or 64 (Free)** - Platform limit
  - **Severity**: ERROR
  - **Auto-fixable**: No
  - **Action**: Consolidate or reduce environment variables

- [ ] **Each environment variable under 5 KB** - Platform limit
  - **Severity**: ERROR
  - **Auto-fixable**: No
  - **Action**: Store large config in KV or R2

### 4.2 Local Development
- [ ] **.dev.vars file in .gitignore** - Security best practice
  - **Severity**: WARNING
  - **Auto-fixable**: Yes
  - **Action**: Add .dev.vars* and .env* to .gitignore

- [ ] **.dev.vars file exists for local dev** - Development convenience
  - **Severity**: INFO
  - **Auto-fixable**: Yes
  - **Action**: Create .dev.vars template

---

## 5. Routing & Networking

### 5.1 Routing Configuration
- [ ] **Routes or custom domains configured** - Deployment requirement
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires user input for domain)
  - **Action**: Document route/domain setup instructions

- [ ] **Routes under 1,000 per zone** - Platform limit
  - **Severity**: ERROR
  - **Auto-fixable**: No
  - **Action**: Consolidate routes or use Workers for Platforms

- [ ] **Custom domains under 100 per zone** - Platform limit
  - **Severity**: ERROR
  - **Auto-fixable**: No (or use wildcard)
  - **Action**: Use wildcard routes or consolidate domains

### 5.2 Service Bindings
- [ ] **Service bindings used for Worker-to-Worker calls** - Best practice
  - **Severity**: INFO
  - **Auto-fixable**: No (architectural decision)
  - **Action**: Recommend service bindings for microservices

---

## 6. Observability & Monitoring

### 6.1 Logging
- [ ] **Observability enabled** - Production requirement
  - **Severity**: WARNING
  - **Auto-fixable**: No (dashboard configuration)
  - **Action**: Document enabling observability in dashboard

- [ ] **JSON logging format used** - Best practice
  - **Severity**: INFO
  - **Auto-fixable**: Yes
  - **Action**: Add JSON logging helper/wrapper

- [ ] **Head-based sampling configured** (for high-traffic apps)
  - **Severity**: INFO
  - **Auto-fixable**: No (requires traffic analysis)
  - **Action**: Recommend sampling rate based on expected traffic

- [ ] **Workers Logs or Logpush configured** - Production logging
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires external service setup)
  - **Action**: Document Logpush configuration steps

### 6.2 Monitoring
- [ ] **Metrics monitoring setup** - Track performance
  - **Severity**: INFO
  - **Auto-fixable**: No (dashboard configuration)
  - **Action**: Document key metrics to monitor (success rate, errors, latency)

- [ ] **Tail Workers for alerting** (optional)
  - **Severity**: INFO
  - **Auto-fixable**: No (requires separate Worker)
  - **Action**: Provide Tail Worker template for alerts

---

## 7. Deployment & CI/CD

### 7.1 Deployment Configuration
- [ ] **First deployment uses C3 or wrangler deploy** - Requirement
  - **Severity**: ERROR
  - **Auto-fixable**: No (manual first deployment)
  - **Action**: Document first deployment command

- [ ] **Versioning strategy defined** - Production best practice
  - **Severity**: INFO
  - **Auto-fixable**: No (process decision)
  - **Action**: Recommend using wrangler versions for gradual rollouts

### 7.2 Environments
- [ ] **Multiple environments configured** (dev, staging, prod)
  - **Severity**: INFO
  - **Auto-fixable**: Yes
  - **Action**: Add environment sections to wrangler.toml

- [ ] **Environment-specific secrets** - Separate dev/prod credentials
  - **Severity**: WARNING
  - **Auto-fixable**: No (manual configuration)
  - **Action**: Document per-environment secret setup

---

## 8. Security

### 8.1 Secrets Management
- [ ] **No secrets in git repository** - Critical security
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (remove and add to .gitignore)
  - **Action**: Scan for exposed secrets, remove, add to .gitignore

- [ ] **Secrets use wrangler secret put** - Proper secret management
  - **Severity**: ERROR
  - **Auto-fixable**: No (manual setup)
  - **Action**: Document secret configuration process

### 8.2 Access Control
- [ ] **API tokens have minimal required permissions** - Least privilege
  - **Severity**: WARNING
  - **Auto-fixable**: No (manual IAM configuration)
  - **Action**: Document required API token permissions

---

## 9. Performance Optimization

### 9.1 Code Optimization
- [ ] **Static assets bundled efficiently** - Performance
  - **Severity**: INFO
  - **Auto-fixable**: No (requires build optimization)
  - **Action**: Recommend build tools and optimizations

- [ ] **HTTP/2 or HTTP/3 compatible** - Modern protocols
  - **Severity**: INFO
  - **Auto-fixable**: N/A (automatic)
  - **Action**: No action needed (Workers supports this automatically)

### 9.2 Caching Strategy
- [ ] **Cache API used appropriately** - Performance optimization
  - **Severity**: INFO
  - **Auto-fixable**: No (requires code changes)
  - **Action**: Provide caching examples/patterns

---

## Checklist Summary by Severity

### ERRORS (Blocking Deployment): 23 items
- Configuration: 4 items
- Runtime: 3 items
- Storage: 6 items
- Environment: 3 items
- Routing: 2 items
- Security: 2 items
- Limits: 3 items

### WARNINGS (Should Fix): 9 items
- Configuration: 1 item
- Storage: 1 item
- Environment: 1 item
- Routing: 1 item
- Observability: 2 items
- Deployment: 1 item
- Security: 2 items

### INFO (Nice to Have): 11 items
- Environment: 1 item
- Routing: 1 item
- Observability: 3 items
- Deployment: 2 items
- Performance: 4 items

**Total Items: 43 checklist items**

---

## Auto-Fixable Items (Can be automated): 18 items
## Manual Items (Require user input/config): 25 items
