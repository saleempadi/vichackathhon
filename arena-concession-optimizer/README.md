# Arena Concession Optimizer — Victoria Royals

Data-driven dashboard and fan-facing mobile tool for concession operations at Save-On-Foods Memorial Centre (Victoria Royals, WHL). Built for VTN26 hackathon.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui
- **Charts**: Recharts
- **Database**: SQLite via better-sqlite3 (read-only in app; `data/arena.db`)
- **AI**: Claude API (@anthropic-ai/sdk) for natural language insights
- **Data**: CSVs + GameDetails.xlsx → 6 concession locations

## Simulation: speed and bucket

The simulation replays a historical game day as live concession demand. Two controls drive how it runs:

- **Bucket size** (e.g. 1 or 5 minutes): how much *simulated* game time each tick represents. One tick = one bucket of transactions.
- **Speed** (e.g. 30× or 60×): how fast simulated time advances relative to real time. The formula is **real_tick_ms = bucket_ms ÷ speed**. Example: bucket = 300 s (5 min), speed = 60 → one tick every 5 seconds real time, so 1 real second = 60 simulated seconds. Wait times and crowd indices are estimated from historical capacity (75th percentile of items per minute per stand) and a simple utilization-based formula.

## How to run

### 1. Seed the database

Place your game data (e.g. **GameDetails.xlsx** and **items-*.csv** files) in a folder named `data` that is a **sibling** of `arena-concession-optimizer` (e.g. `your-repo/data/` and `your-repo/arena-concession-optimizer/`). Then:

```bash
cd arena-concession-optimizer
npm install
npm run seed
```

This builds `data/arena.db`, including games, transactions, seat zones, zone distances, item availability, and puck drop times when present in GameDetails.

### 2. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Key pages

- **[/simulate](http://localhost:3000/simulate)** — Simulation mode: pick a game date (from the DB dropdown), set speed and bucket size, start the stream. You get a real-time clock, per-stand metrics, arena heatmap, and an optional “Game started” / “Pre-game” badge when puck drop is in the data.
- **[/fan](http://localhost:3000/fan)** — Fan Finder (mobile-friendly): pick your section (zone), category or “Route to stand”, optional in-page simulation to see live estimated wait times. Use the sidebar “Fan Finder” link to open it in a new tab.

## Project structure

- `src/app/` — App Router pages and API routes
- `src/app/api/game-dates/` — GET list of transaction dates for simulation
- `src/app/api/simulate/` — SSE stream for simulation
- `src/app/api/fan/` — Fan data (wait times, zones, route-to-stand)
- `src/app/api/puck-drop/` — Puck drop time by date
- `src/app/api/seat-zones/` — Seat zones with map coordinates
- `src/lib/queries.ts` — SQLite queries and historical capacity
- `scripts/seed-db.ts` — ETL: CSV/XLSX → SQLite (run via `npm run seed`)

## Environment

- `ANTHROPIC_API_KEY` — optional; required for the AI Insights page (set in `.env.local`).

## Deploy with Docker

```bash
docker build -t arena-concession-optimizer .
docker run -p 3000:3000 arena-concession-optimizer
```

Ensure `data/arena.db` exists (e.g. mount a volume or run the seed during build).
