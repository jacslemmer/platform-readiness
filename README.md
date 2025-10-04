# Platform Readiness

A web application to test AI-generated wrapper applications for cloud platform deployment readiness and automatically port them to target platforms.

## Features

- **Platform Detection**: Analyze applications and detect their current structure
- **Readiness Testing**: Test applications against platform-specific requirements (Azure, Cloudflare, AWS, etc.)
- **Automated Porting**: Convert and prepare applications with platform-specific configurations
- **Multi-Platform Support**: Azure, Cloudflare, and extensible to other platforms

## Project Structure

```
platform-readiness/
├── frontend/          # React + TypeScript frontend
├── backend/           # Node.js + Express backend
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This will start both the frontend and backend development servers.

## Supported Platforms

- Microsoft Azure
- Cloudflare
- (Extensible to other platforms)
