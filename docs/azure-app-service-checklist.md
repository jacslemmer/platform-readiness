# Azure App Service Production Readiness Checklist

This comprehensive checklist is compiled from official Microsoft Azure documentation (2025) and hard-learned production lessons.

**Sources:**
- https://learn.microsoft.com/en-us/azure/well-architected/service-guides/app-service-web-apps
- https://learn.microsoft.com/en-us/azure/app-service/deploy-best-practices
- https://learn.microsoft.com/en-us/azure/reliability/reliability-app-service
- https://learn.microsoft.com/en-us/azure/app-service/overview-security
- https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check
- https://learn.microsoft.com/en-us/azure/app-service/app-service-best-practices

**Additional Critical Insights**: See [azure-new-insights-collated.md](./azure-new-insights-collated.md) for MANDATORY requirements learned through production debugging (Mixed Content errors, port binding, health endpoints, etc.)

---

## ⚠️ CRITICAL: Read This First

**Before any Azure deployment**, you MUST review [azure-new-insights-collated.md](./azure-new-insights-collated.md) which contains:

1. **Mixed Content Error Solution** - HTTPS frontend cannot call HTTP backend (browser blocks it)
2. **Port Binding Requirements** - Must listen on `process.env.PORT` not hardcoded ports
3. **Two Health Endpoints Required** - `/health` (liveness) AND `/ready` (readiness)
4. **SIGTERM Handler** - Graceful shutdown for zero-downtime deployments
5. **Structured Logging** - JSON to stdout/stderr only, NO console.log
6. **Operational Runbooks** - Required for production (templates provided)
7. **RPO/RTO Targets** - Define recovery objectives before architecting
8. **Database Migrations in CI/CD** - Idempotent migrations required
9. **Azure Container Registry** - Never use `latest` tag
10. **Deployment Slots with Swap-Preview** - Multi-phase deployment process

**These are NOT optional** - they will cause production failures if missing.

---

## 0. ⚠️ CRITICAL BLOCKERS (Fix These First)

### 0.1 Mixed Content Security (PRODUCTION BLOCKER)
- [ ] **Backend MUST use HTTPS** - Browser blocks HTTPS→HTTP requests
  - **Severity**: CRITICAL ERROR
  - **Auto-fixable**: No (requires Azure infrastructure change)
  - **Action**: Enable HTTPS on Container Instance/App Service OR use Application Gateway/Front Door for TLS termination
  - **Symptom**: "Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'"
  - **Reference**: See azure-new-insights-collated.md section "Mixed Content Error Solution"

- [ ] **Frontend API URL uses HTTPS** - Environment variable, not hardcoded
  - **Severity**: CRITICAL ERROR
  - **Auto-fixable**: Yes (update env var)
  - **Action**: Set `VITE_API_URL=https://...` or `REACT_APP_API_URL=https://...` in Static Web App settings

### 0.2 Port Binding (STARTUP BLOCKER)
- [ ] **App listens on Azure-provided port** - process.env.PORT or $PORT
  - **Severity**: CRITICAL ERROR
  - **Auto-fixable**: Yes
  - **Action**: Change `app.listen(3001)` to `app.listen(process.env.PORT || 8080)`
  - **Symptom**: Container starts but health checks fail, app unreachable
  - **Startup timeout**: App must start within 60 seconds

### 0.3 Health Endpoints (RELIABILITY BLOCKER)
- [ ] **/health endpoint (liveness)** - Basic health check
  - **Severity**: CRITICAL ERROR
  - **Auto-fixable**: Yes
  - **Action**: Add GET `/health` returning 200 OK with `{"status":"healthy"}`
  - **Response time**: Must respond within 5 seconds

- [ ] **/ready endpoint (readiness)** - Comprehensive health check
  - **Severity**: CRITICAL ERROR
  - **Auto-fixable**: Yes
  - **Action**: Add GET `/ready` that checks DB, cache, external dependencies
  - **Failure behavior**: 3 consecutive failures = instance removed from load balancer

### 0.4 Graceful Shutdown (ZERO-DOWNTIME BLOCKER)
- [ ] **SIGTERM handler implemented** - Clean shutdown on deployment
  - **Severity**: CRITICAL ERROR
  - **Auto-fixable**: Yes
  - **Action**: Add `process.on('SIGTERM', () => { server.close(); /* cleanup */ })`
  - **Consequence**: Without this, active requests drop during deployments

### 0.5 Logging Configuration (DEBUGGING BLOCKER)
- [ ] **Logs to stdout/stderr only** - No file-based logging
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Remove fs.writeFile for logs, use console.log/console.error

- [ ] **Structured JSON logging** - Parseable logs for Application Insights
  - **Severity**: WARNING
  - **Auto-fixable**: Yes
  - **Action**: Use Winston/Pino/Bunyan with JSON formatter, not raw console.log

---

## 1. Configuration & Deployment

### 1.1 Essential Configuration Files
- [ ] **package.json exists** - Required for Node.js apps
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (if Node.js app detected)
  - **Action**: Create package.json with basic metadata

- [ ] **Start script defined in package.json** - Required by App Service
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Add `"start": "node server.js"` to scripts

- [ ] **Azure deployment configuration** - azure.yaml or .azure/config
  - **Severity**: ERROR
  - **Auto-fixable**: Yes
  - **Action**: Create azure.yaml with App Service configuration

- [ ] **Node.js version specified** - In package.json engines
  - **Severity**: WARNING
  - **Auto-fixable**: Yes
  - **Action**: Add `"engines": {"node": ">=18.0.0"}` to package.json

### 1.2 Deployment Strategy
- [ ] **Deployment slots configured** - Blue-green deployment support
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Azure resource creation)
  - **Action**: Document creating staging slot (requires Standard tier or higher)

- [ ] **Continuous deployment NOT on production slot** - Best practice
  - **Severity**: WARNING
  - **Auto-fixable**: No (process/pipeline configuration)
  - **Action**: Document deploying to staging, then swap

- [ ] **Swap with preview enabled** - Multi-phase swap for safety
  - **Severity**: INFO
  - **Auto-fixable**: No (deployment process)
  - **Action**: Document swap with preview procedure

- [ ] **Kudu build or custom build configured** - Build strategy
  - **Severity**: INFO
  - **Auto-fixable**: No (deployment pipeline decision)
  - **Action**: Recommend Kudu zipdeploy for Node.js

---

## 2. Reliability & High Availability

### 2.1 Compute Resources
- [ ] **App Service Plan tier is Premium v3 or higher** - Production requirement
  - **Severity**: ERROR
  - **Auto-fixable**: No (requires Azure resource configuration)
  - **Action**: Document using Premium v3 for zone redundancy and features

- [ ] **Minimum 2 instances configured** - High availability
  - **Severity**: ERROR
  - **Auto-fixable**: No (requires Azure resource scaling)
  - **Action**: Document scaling to at least 2 instances

- [ ] **Zone redundancy enabled** - Fault tolerance (Premium v2-v4)
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Azure configuration)
  - **Action**: Document enabling zone redundancy in portal

- [ ] **Multiple availability zones configured** - Disaster recovery
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure infrastructure setting)
  - **Action**: Document zone distribution configuration

### 2.2 Scaling Strategy
- [ ] **Autoscaling configured** - Dynamic resource allocation
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires performance analysis)
  - **Action**: Document autoscale rules (CPU/memory thresholds)

- [ ] **Autoscale triggers at 65% CPU** - Proactive scaling, not 95%
  - **Severity**: INFO
  - **Auto-fixable**: No (requires monitoring data)
  - **Action**: Recommend 65% threshold for adequate initialization time

- [ ] **Scale out (not up/down) for traffic** - Avoid restarts
  - **Severity**: INFO
  - **Auto-fixable**: No (architectural guidance)
  - **Action**: Document horizontal scaling best practice

- [ ] **Over-provision for zone failures** - Capacity planning
  - **Severity**: WARNING
  - **Auto-fixable**: No (capacity planning)
  - **Action**: Calculate N+1 or N+2 capacity for zone failures

### 2.3 Health Monitoring
- [ ] **Health check endpoint configured** - /health or /api/health
  - **Severity**: WARNING
  - **Auto-fixable**: Yes
  - **Action**: Create health check endpoint in application

- [ ] **Health check enabled in App Service** - Automatic instance management
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure portal configuration)
  - **Action**: Document enabling health check feature (requires 2+ instances)

- [ ] **Health check tests critical components** - DB, cache, external services
  - **Severity**: WARNING
  - **Auto-fixable**: Partial (add basic checks)
  - **Action**: Implement comprehensive health checks

- [ ] **Auto-heal configured** - Automatic recovery from failures
  - **Severity**: INFO
  - **Auto-fixable**: No (Azure portal configuration)
  - **Action**: Document auto-heal rule configuration

---

## 3. Security

### 3.1 Authentication & Authorization
- [ ] **Microsoft Entra ID authentication enabled** - Identity management
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Azure AD setup)
  - **Action**: Document Entra ID Easy Auth configuration

- [ ] **HTTPS enforced** - All traffic over TLS
  - **Severity**: ERROR
  - **Auto-fixable**: No (Azure portal setting)
  - **Action**: Document enabling "HTTPS Only" in portal

- [ ] **TLS 1.2 or higher required** - Modern encryption
  - **Severity**: ERROR
  - **Auto-fixable**: No (Azure portal setting)
  - **Action**: Document setting minimum TLS version to 1.2

- [ ] **Basic authentication disabled** - Security best practice
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure portal setting)
  - **Action**: Document disabling basic auth for SCM and FTP

### 3.2 Certificates & Domain Security
- [ ] **Custom domain configured** - Production requirement
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires domain ownership)
  - **Action**: Document custom domain binding process

- [ ] **App Service Managed Certificate used** - Or valid TLS certificate
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure portal configuration)
  - **Action**: Document enabling managed certificate

- [ ] **No hard dependency on wildcard certificate** - Avoid pinning
  - **Severity**: WARNING
  - **Auto-fixable**: No (code review required)
  - **Action**: Ensure app doesn't pin to default *.azurewebsites.net cert

- [ ] **SNI SSL configured** - Modern TLS binding
  - **Severity**: INFO
  - **Auto-fixable**: No (certificate binding setting)
  - **Action**: Document SNI SSL vs IP-based SSL

### 3.3 Network Security
- [ ] **Virtual Network integration configured** - Network isolation
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure networking setup)
  - **Action**: Document VNet integration for backend services

- [ ] **Private endpoints configured** - For sensitive workloads
  - **Severity**: INFO
  - **Auto-fixable**: No (Azure networking setup)
  - **Action**: Document private endpoint configuration

- [ ] **IP restrictions configured** - Access control
  - **Severity**: INFO
  - **Auto-fixable**: No (requires IP allowlist)
  - **Action**: Document IP restriction rules

- [ ] **Web Application Firewall (WAF) enabled** - DDoS and attack protection
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Application Gateway or Front Door)
  - **Action**: Document WAF setup with App Gateway

### 3.4 Secrets Management
- [ ] **No .env file in deployment** - Environment variables
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (remove from deployment)
  - **Action**: Exclude .env from deployment, use App Settings

- [ ] **Secrets stored in Azure Key Vault** - Secure secret management
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Key Vault setup)
  - **Action**: Document Key Vault integration with managed identity

- [ ] **Managed Identity configured** - Password-less authentication
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure portal configuration)
  - **Action**: Document system or user-assigned managed identity setup

- [ ] **Connection strings in App Settings** - Not in code
  - **Severity**: ERROR
  - **Auto-fixable**: Partial (detect hardcoded strings)
  - **Action**: Move connection strings to App Settings, mark as sensitive

---

## 4. Storage & Data

### 4.1 Database Configuration
- [ ] **No SQLite in production** - Ephemeral file system
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (migrate to Azure SQL)
  - **Action**: Replace SQLite with Azure SQL Database

- [ ] **Azure SQL Database or Cosmos DB configured** - Managed database
  - **Severity**: WARNING (if database needed)
  - **Auto-fixable**: No (requires database provisioning)
  - **Action**: Document Azure SQL or Cosmos DB connection

- [ ] **Database connection uses Managed Identity** - No passwords
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Azure configuration)
  - **Action**: Document managed identity authentication for SQL

- [ ] **Database in same region** - Latency optimization
  - **Severity**: WARNING
  - **Auto-fixable**: No (resource placement)
  - **Action**: Document co-locating database with App Service

### 4.2 File Storage
- [ ] **No persistent local file storage** - Ephemeral file system
  - **Severity**: ERROR
  - **Auto-fixable**: Yes (migrate to Blob Storage)
  - **Action**: Replace fs.writeFile with Azure Blob Storage SDK

- [ ] **Azure Blob Storage configured** - For file uploads/storage
  - **Severity**: WARNING (if file storage needed)
  - **Auto-fixable**: No (requires storage account)
  - **Action**: Document Blob Storage account creation and connection

- [ ] **Multer configured for memory storage** - Or stream to Blob
  - **Severity**: WARNING
  - **Auto-fixable**: Yes
  - **Action**: Configure multer for memoryStorage, then upload to Blob

- [ ] **Local cache enabled** (optional) - Performance optimization
  - **Severity**: INFO
  - **Auto-fixable**: No (App Service setting)
  - **Action**: Document enabling local cache for read-heavy apps

### 4.3 Data Redundancy
- [ ] **Database backup configured** - Disaster recovery
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure SQL configuration)
  - **Action**: Document automated backup configuration

- [ ] **Blob Storage geo-replication** - Data durability
  - **Severity**: INFO
  - **Auto-fixable**: No (Storage account setting)
  - **Action**: Document GRS or RA-GRS storage redundancy

---

## 5. Monitoring & Observability

### 5.1 Application Insights
- [ ] **Application Insights enabled** - APM and monitoring
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires App Insights resource)
  - **Action**: Document Application Insights integration

- [ ] **Instrumentation key configured** - Or connection string
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires manual setup)
  - **Action**: Add APPLICATIONINSIGHTS_CONNECTION_STRING to settings

- [ ] **Custom telemetry implemented** - Business metrics
  - **Severity**: INFO
  - **Auto-fixable**: No (code instrumentation)
  - **Action**: Provide telemetry examples for key operations

### 5.2 Diagnostic Logging
- [ ] **Diagnostic logs enabled** - Application and web server logs
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure portal setting)
  - **Action**: Document enabling diagnostic settings

- [ ] **Log retention configured** - Storage and retention policy
  - **Severity**: INFO
  - **Auto-fixable**: No (Azure portal setting)
  - **Action**: Recommend log retention period (e.g., 30-90 days)

- [ ] **Resource logs enabled** - Activity and security audit
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure Monitor setting)
  - **Action**: Document resource log configuration

### 5.3 Alerts & Monitoring
- [ ] **CPU and memory alerts configured** - Resource monitoring
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure Monitor alerts)
  - **Action**: Document alert rules for >80% CPU/memory

- [ ] **HTTP error alerts configured** - 5xx and 4xx errors
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure Monitor alerts)
  - **Action**: Document alerts for elevated error rates

- [ ] **Response time alerts** - Performance SLAs
  - **Severity**: INFO
  - **Auto-fixable**: No (Azure Monitor alerts)
  - **Action**: Document P95/P99 latency alerts

- [ ] **Service Health alerts** - Azure service incidents
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure Service Health)
  - **Action**: Document Service Health alert configuration

- [ ] **Resource Health monitoring** - App Service health
  - **Severity**: WARNING
  - **Auto-fixable**: No (Azure Resource Health)
  - **Action**: Document Resource Health alert setup

---

## 6. Performance Optimization

### 6.1 Application Configuration
- [ ] **"Always On" enabled** - Prevent cold starts
  - **Severity**: WARNING
  - **Auto-fixable**: No (App Service setting)
  - **Action**: Document enabling "Always On" (requires Basic tier+)

- [ ] **ARR Affinity disabled** - Better load distribution
  - **Severity**: INFO
  - **Auto-fixable**: No (App Service setting)
  - **Action**: Document disabling ARR affinity for stateless apps

- [ ] **HTTP/2 enabled** - Modern protocol support
  - **Severity**: INFO
  - **Auto-fixable**: No (App Service setting)
  - **Action**: Document enabling HTTP/2

- [ ] **Compression enabled** - Reduce bandwidth
  - **Severity**: INFO
  - **Auto-fixable**: No (App Service setting or middleware)
  - **Action**: Enable dynamic compression or gzip middleware

### 6.2 Performance Testing
- [ ] **Load testing performed** - Azure Load Testing
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires test creation)
  - **Action**: Document load testing with Azure Load Testing

- [ ] **Performance baseline established** - Response times, throughput
  - **Severity**: INFO
  - **Auto-fixable**: No (requires testing)
  - **Action**: Document key performance indicators

### 6.3 Caching Strategy
- [ ] **Azure Cache for Redis configured** - Session state and caching
  - **Severity**: INFO
  - **Auto-fixable**: No (requires Redis resource)
  - **Action**: Document Redis integration for scalability

- [ ] **CDN configured for static assets** - Azure Front Door or CDN
  - **Severity**: INFO
  - **Auto-fixable**: No (requires CDN resource)
  - **Action**: Document CDN configuration for static content

---

## 7. Operational Excellence

### 7.1 DevOps & Automation
- [ ] **Infrastructure as Code implemented** - ARM/Bicep/Terraform
  - **Severity**: INFO
  - **Auto-fixable**: No (requires IaC templates)
  - **Action**: Provide Bicep template for App Service resources

- [ ] **CI/CD pipeline configured** - Azure DevOps or GitHub Actions
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires pipeline setup)
  - **Action**: Provide GitHub Actions workflow template

- [ ] **Automated testing in pipeline** - Unit and integration tests
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires test suite)
  - **Action**: Document test stage in deployment pipeline

### 7.2 Environment Management
- [ ] **Separate environments** - Dev, Staging, Production
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires multiple resources)
  - **Action**: Document multi-environment architecture

- [ ] **Environment-specific configuration** - App Settings per environment
  - **Severity**: WARNING
  - **Auto-fixable**: No (portal configuration)
  - **Action**: Document slot-specific settings

### 7.3 Resource Organization
- [ ] **Resources in same region** - Co-location for performance
  - **Severity**: WARNING
  - **Auto-fixable**: No (resource placement)
  - **Action**: Document deploying all resources to same Azure region

- [ ] **Resource naming convention** - Consistent naming
  - **Severity**: INFO
  - **Auto-fixable**: No (organizational policy)
  - **Action**: Recommend Azure naming conventions

- [ ] **Resource tags applied** - Cost tracking and management
  - **Severity**: INFO
  - **Auto-fixable**: No (Azure portal)
  - **Action**: Document tagging strategy (environment, cost center, etc.)

---

## 8. Cost Optimization

### 8.1 Pricing & Scaling
- [ ] **Appropriate tier selected** - Balance features and cost
  - **Severity**: INFO
  - **Auto-fixable**: No (business decision)
  - **Action**: Document tier comparison and recommendations

- [ ] **Reserved instances considered** - For predictable workloads
  - **Severity**: INFO
  - **Auto-fixable**: No (purchasing decision)
  - **Action**: Document 1-year or 3-year reservation savings

- [ ] **Scale-in rules configured** - Reduce costs during low demand
  - **Severity**: INFO
  - **Auto-fixable**: No (autoscale configuration)
  - **Action**: Document scale-down rules for off-peak hours

### 8.2 Cost Monitoring
- [ ] **Cost alerts configured** - Budget management
  - **Severity**: INFO
  - **Auto-fixable**: No (Azure Cost Management)
  - **Action**: Document budget and alert configuration

- [ ] **Cost analysis reviewed** - Regular cost optimization
  - **Severity**: INFO
  - **Auto-fixable**: No (management process)
  - **Action**: Document monthly cost review process

---

## 9. Disaster Recovery & Business Continuity

### 9.1 Multi-Region Deployment
- [ ] **Multi-region architecture** - Disaster recovery
  - **Severity**: INFO
  - **Auto-fixable**: No (architectural decision)
  - **Action**: Document active-active or active-passive multi-region setup

- [ ] **Traffic Manager or Front Door configured** - Global load balancing
  - **Severity**: INFO
  - **Auto-fixable**: No (requires additional resources)
  - **Action**: Document Traffic Manager configuration

- [ ] **Data replication across regions** - Database and storage
  - **Severity**: INFO
  - **Auto-fixable**: No (database and storage configuration)
  - **Action**: Document geo-replication setup

### 9.2 Backup & Recovery
- [ ] **App Service backup enabled** - Configuration and data backup
  - **Severity**: WARNING
  - **Auto-fixable**: No (requires Basic tier+)
  - **Action**: Document backup schedule and retention

- [ ] **Backup restoration tested** - Validate recovery process
  - **Severity**: INFO
  - **Auto-fixable**: No (operational procedure)
  - **Action**: Document quarterly backup restoration test

---

## Checklist Summary by Severity

### CRITICAL ERRORS (MUST FIX - Production Blockers): 9 items ⚠️
- **Section 0**: Mixed Content (2), Port Binding (1), Health Endpoints (2), Graceful Shutdown (1), Logging (3)
- **Consequence**: App will NOT work in production without these

### ERRORS (Blocking Deployment): 11 items
- Configuration: 3 items (package.json, start script, azure config)
- Reliability: 2 items (Premium tier, 2+ instances)
- Security: 3 items (HTTPS, TLS 1.2, connection strings)
- Storage: 3 items (no SQLite, no .env, no local file storage)

### WARNINGS (Should Fix): 41 items
- Configuration: 3 items
- Reliability: 8 items
- Security: 11 items
- Storage: 5 items
- Monitoring: 8 items
- Performance: 2 items
- Operations: 4 items

### INFO (Nice to Have): 28 items
- Deployment: 3 items
- Reliability: 2 items
- Security: 3 items
- Storage: 1 item
- Monitoring: 2 items
- Performance: 5 items
- Operations: 3 items
- Cost: 5 items
- DR/BC: 4 items

**Total Items: 89 checklist items** (was 80, added 9 critical blockers from production lessons)

---

## Auto-Fixable Items (Can be automated): 18 items (was 12, added 6 critical fixes)
## Manual Items (Require Azure portal/user config): 71 items (was 68, added 3 from critical section)

---

## Azure Well-Architected Framework Pillars Coverage

1. **Reliability**: 13 items (added health endpoints, graceful shutdown, port binding)
2. **Security**: 19 items (added HTTPS requirement, structured logging)
3. **Cost Optimization**: 5 items
4. **Operational Excellence**: 10 items
5. **Performance Efficiency**: 10 items

---

## 🚨 DEPLOYMENT READINESS: Step-by-Step

**Phase 0: Critical Blockers (DO THESE FIRST)**
1. ✅ Fix Mixed Content error (enable HTTPS on backend)
2. ✅ Update frontend API URL to use https://
3. ✅ Change port binding to process.env.PORT
4. ✅ Add /health endpoint
5. ✅ Add /ready endpoint
6. ✅ Implement SIGTERM handler
7. ✅ Switch to stdout/stderr logging
8. ✅ Add structured JSON logging

**Phase 1: Configuration Errors**
→ Work through Section 1-4 ERROR items

**Phase 2: Security & Monitoring Warnings**
→ Work through Section 3-5 WARNING items

**Phase 3: Optimization**
→ Work through Section 6-9 INFO items

**DO NOT skip Phase 0** - these will cause immediate production failures.
