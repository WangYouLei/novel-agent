# NovelAgent

English | [简体中文](./README.md)

NovelAgent is a **pluggable AI-powered novel writing platform**. Core writing capabilities are provided by independent feature plugins — you can select, combine, and extend them like building blocks.

## Key Features

- **Pluggable architecture**: Writing capabilities live in plugins that can be independently installed, uninstalled, enabled, and disabled, with dependency declaration between plugins
- **Personalized styles**: A three-tier style-pack system (built-in / user-generated / third-party), with one main style pack per novel
- **Full writing workflow**: From idea incubation, worldbuilding, and character design to outline planning and chapter-by-chapter writing
- **Novel editor**: A novel-centric editing page with chapter management (create, edit, reorder, delete) and automatic word count, with AI chat integrated for writing while you ask
- **Dual model access**: Built-in free models (credit-based billing) + user-defined models (bring your own API key, e.g. OpenAI, Claude, or local models)
- **Low floor, high ceiling**: Ready to use out of the box for beginners; fully customizable models, styles, and plugins for power users

## Tech Stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript 5.x (full-stack) |
| Package management | pnpm + monorepo |
| Backend framework | Nest.js |
| Plugin kernel | Cordis (plugin meta-framework from Koishi; separate contexts on frontend and backend, bridged via WebSocket) |
| ORM / Database | Prisma + SQLite (MVP, ready to switch to PostgreSQL) |
| Frontend | Vue 3 + Element Plus + Pinia |
| Real-time | Socket.IO (streaming output, event bridging) |
| Build tooling | Vite (frontend) + tsup (libraries/backend) |
| Quality | ESLint + Prettier + Vitest |

## Repository Layout

```
novel-agent/
├── apps/
│   ├── launcher/            # App launcher
│   └── marketplace/         # Plugin marketplace service (standalone process: publish/browse/download)
└── packages/
    ├── core/                # Plugin kernel (Cordis wrapper, extension points, events, services)
    ├── shared/              # Shared types and utilities
    ├── application/         # Application services (novels, writing, outlines, style packs, billing, users)
    ├── model-service/       # Model service (built-in model access, style analysis)
    ├── market-client/       # Plugin marketplace client (local repo, installer, HTTP marketplace client)
    ├── web/                 # Web app (Nest.js server + Vue 3 client)
    └── plugins/             # Official plugins (openai-model, outline-generator, style-generator)
```

## Getting Started

Prerequisites: Node.js >= 18.18, pnpm

```bash
# Install dependencies
pnpm install

# Build all packages (the launcher syncs each official plugin's dist output; build first before the first run)
pnpm build

# Start development
pnpm dev

# Start the plugin marketplace service (optional, port 3100 by default; browse/install/update plugins on the "Marketplace" page)
pnpm market:dev

# Run database migrations (also executed automatically when starting via pnpm dev)
pnpm db:migrate
```

- Default ports: main app `3000` (override with the `PORT` env var), plugin marketplace `3100` (override with `MARKET_PORT`)
- Data directory: defaults to `data/` at the repo root (SQLite database, key files, plugin repository, built-in style packs); redirect it with the `NOVELAGENT_DATA_ROOT` env var

> When the marketplace service is not running, the marketplace page shows an offline notice; you can still install a plugin by uploading its zip via "Install local plugin" on that page. Third-party plugin zips can be published to the marketplace via `POST /api/market/publish` (multipart field name `file`).

## License

For learning and personal use only.
