# Platform Agnostic Test Application

A simple Task Manager API built with Express and TypeScript. This application is intentionally NOT ready for any cloud platform deployment.

## Features

- REST API for managing tasks (CRUD operations)
- SQLite database for data persistence
- File upload capability for task attachments
- Environment variable configuration

## Platform Readiness Issues

This application has the following issues that make it NOT ready for cloud deployment:

### For Cloudflare:
- Uses Express (needs Cloudflare Workers)
- Uses SQLite directly (needs D1 database)
- Uses local file storage (needs R2 object storage)
- Hardcoded port binding
- Missing `wrangler.toml` configuration
- No Workers-compatible entry point

### For Azure:
- Missing `azure.yaml` configuration
- No App Service deployment config
- Database connection not configured for Azure SQL
- File storage not configured for Azure Blob Storage
- Missing environment variable setup for Azure

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

## API Endpoints

- `GET /health` - Health check
- `GET /tasks` - Get all tasks
- `POST /tasks` - Create a new task
- `PUT /tasks/:id` - Update a task
- `DELETE /tasks/:id` - Delete a task
- `POST /tasks/:id/attachment` - Upload file attachment
