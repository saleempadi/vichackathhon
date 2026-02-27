# Arena Concession Optimizer — Simulation + Fan Routing Extension Plan (Your Track)

## Why this extension exists
The current project is an admin-facing analytics dashboard (overview, location deep dive, predictions, AI insights). This extension adds:
1) A **simulation engine** that replays historical POS sales as accelerated “live” data.
2) A **fan-facing route + wait-time recommender** ("Google Maps for concessions") that estimates the fastest stand (or faster item alternatives) based on current simulated congestion and walking distance from the fan’s seat/section.

This is hackathon-grade innovation: it demonstrates real-time systems thinking and a tangible user feature that can improve sales and reduce frustration.

---

## Constraints (important)
We do NOT have:
- true queue length
- staffing count / open registers
- service time per order
- a real seat map with coordinates

We will explicitly model these via **assumptions** and **inference** and label outputs as **Estimated**.

Primary data available:
- 14 CSVs with Date, Time, Category, Item, Qty, Price Point Name, Location
- GameDetails.xlsx with partial event metadata (attendance scanned, opponent, puck drop)

---

## Product features added

### A) Admin Simulation Mode (Dashboard page)
Goal: show **live demand** and a heatmap around stands as if the game is happening now.

Admin selects:
- game date (or "best match" game day)
- simulation speed (e.g., 10x, 30x, 60x)
- time bucket size (e.g., 1 min, 5 min)
- queue model parameters (service rate, registers)

Dashboard shows:
- "Current minute" in simulation clock
- per-stand "demand" tiles: orders/min, items/min, queue pressure, estimated wait
- arena map: 6 stands colored by congestion
- optional: top selling items in last N simulated minutes

### B) Fan Route + Wait-Time Recommendation (Fan page)
Goal: a fan wants an item (e.g. hot dog). The app recommends:
- best stand to minimize total round-trip time (walk there + wait + walk back)
- alternative items that are “close enough” but faster (if user would miss intermission)

Inputs:
- seat/section identifier (simple dropdown for MVP: Section A/B/C… or "Upper/Lower")
- desired item OR category
- optionally: max time allowed (e.g., break length = 10 minutes)

Outputs:
- Top 3 recommended stands with:
  - estimated round trip time
  - estimated wait time component
  - walking time component
- Alternative suggestions:
  - same category alternatives with lower estimated total time
  - “nearby stands” that have the item historically

---

## Core engineering design

### 1) Simulation clock + streaming
We replay historical transactions for one game day at accelerated speed.

Concept:
- Convert each transaction line into a timestamp: `ts = Date + Time`
- Bucket transactions into `bucket_start = floor(ts to bucket_size)`
- Create ordered list of buckets: [{bucket_start, rows[]}...]

Simulation runtime:
- At each tick, advance simulated time by `bucket_size`
- Emit an event payload containing bucket aggregate metrics per stand
- Frontend updates charts and heatmap in real time

Transport:
- Use Server-Sent Events (SSE) OR WebSocket
  - SSE is simpler; WebSocket is fine if already used

Recommendation:
- Use SSE for hackathon MVP (stable, simple).

### 2) Estimating queue / wait time (inference model)
We estimate queue pressure from observed transaction flow.

We need an “arrival rate” proxy:
- Define an "order" proxy: group by same `Date + Time + Location` as one order (already in teammate plan).
- For each stand, compute:
  - `orders_in_window` over rolling window W (e.g., last 5 simulated minutes)
  - `lambda = orders_in_window / W` orders per minute

We need a service capacity proxy:
- Assume `register_count` per stand (c) (defaults: 2) — admin adjustable slider
- Assume `service_rate_per_register` (mu) (defaults: 0.6 orders/min = 100 sec/order) — admin adjustable slider
- Total service rate: `service_capacity = c * mu`

Queue pressure:
- `utilization = lambda / service_capacity`
- Clamp utilization to [0, 1.5] for stability in UI

Estimated wait time options (choose MVP approach):
A) Simple wait approximation (recommended MVP):
- `wait_minutes = max(0, (utilization - 0.6)) * wait_scale`
- where `wait_scale` default 12 minutes at utilization=1.0
- This is easy to tune and avoids complex queue math.

B) Light queueing approximation (optional later):
- M/M/c approximation with utilization
- Only if time permits; MVP does not require it.

We will implement A) first with configurable parameters.

### 3) People-around-stand estimate (for heatmap)
We estimate “crowd” near a stand as a function of queue and order rate:
- `crowd_index = alpha * orders_last_5min + beta * wait_minutes`
- Use normalized values to color stands on the arena map (green/yellow/red).
This is an index, NOT actual people count.

### 4) Walking time model (seat -> stand)
For MVP, define seat/section groups and approximate distances.

Approach:
- Create a small lookup table:
  - `seat_zone` (e.g., "Lower Bowl North", "Lower Bowl South", "Upper Bowl")
  - distance to each of 6 stands in meters OR minutes
- Walking time:
  - `walk_minutes = distance_m / 80m_per_min` (≈ 1.3 m/s)

This is realistic enough for hackathon and fully free.

---

## Data / DB changes (SQLite)

Existing tables in teammate plan:
- games, transactions, upcoming_games

Additions for simulation/fan routing:
1) `seat_zones` (MVP zone model)
```sql
CREATE TABLE seat_zones (
  zone_id TEXT PRIMARY KEY,
  zone_label TEXT NOT NULL
);
```

2) `zone_distances` (zone -> stand distance)
```sql
CREATE TABLE zone_distances (
  zone_id TEXT NOT NULL,
  location TEXT NOT NULL,
  distance_m REAL NOT NULL,
  PRIMARY KEY (zone_id, location),
  FOREIGN KEY (zone_id) REFERENCES seat_zones(zone_id)
);
```

3) Optional: `item_availability` materialization
We need fast lookups: which stands sell an item historically.
```sql
CREATE TABLE item_availability (
  item TEXT NOT NULL,
  location TEXT NOT NULL,
  PRIMARY KEY (item, location)
);
```
Populate from transactions distinct (excluding refunds/test).

No need to store simulation ticks in DB for MVP; compute on-the-fly from transactions.

---

## API design (Next.js App Router)

### 1) Simulation stream endpoint (SSE)
`GET /api/simulate?date=YYYY-MM-DD&speed=30&bucket=60&window=300`

Parameters:
- date: game day to replay
- speed: how many simulated seconds per 1 real second (or a multiplier)
- bucket: bucket size in seconds (60 or 300)
- window: rolling window size in seconds for lambda computation (e.g., 300)

Response (SSE event payload JSON):
```json
{
  "sim_time": "2026-02-21T19:15:00",
  "bucket_start": "2026-02-21T19:10:00",
  "bucket_end": "2026-02-21T19:15:00",
  "locations": {
    "Island Canteen": {
      "orders_in_bucket": 22,
      "qty_in_bucket": 41,
      "orders_per_min": 4.4,
      "utilization": 0.92,
      "wait_minutes": 6.8,
      "crowd_index": 0.73,
      "top_items": [{"item":"Hot Dog","qty":9},{"item":"Popcorn","qty":6}]
    },
    "...": {}
  }
}
```

Implementation detail:
- Preload all transactions for that date from SQLite (ordered by timestamp)
- Build buckets in memory once, then stream them

### 2) Fan recommendation endpoint
`POST /api/recommend`

Request:
```json
{
  "zone_id": "LOWER_NORTH",
  "desired_item": "Hot Dog",
  "max_minutes": 10,
  "sim_time": "2026-02-21T19:15:00",
  "assumptions": {
    "register_count_default": 2,
    "service_rate_per_register": 0.6,
    "wait_scale": 12
  }
}
```

Response:
```json
{
  "recommendations": [
    {
      "location": "Island Canteen",
      "walk_minutes": 3.5,
      "wait_minutes": 6.8,
      "round_trip_minutes": 13.8,
      "confidence": "MED"
    }
  ],
  "alternatives": [
    {
      "item": "Burger",
      "location": "Island Slice",
      "round_trip_minutes": 9.5,
      "reason": "Similar category, lower congestion"
    }
  ],
  "notes": [
    "Wait times are estimated from recent order rate and assumed service capacity."
  ]
}
```

Logic:
- Determine stands that sell desired_item from item_availability
- For each stand:
  - walk = zone_distances(zone, stand)
  - wait = current wait estimate (from sim state / rolling window)
  - total = 2*walk + wait
- Sort and return top results
- If total > max_minutes:
  - find alternative items in same category (or a curated substitution list)
  - compute totals similarly and return “faster alternatives”

### 3) Admin parameter endpoint (optional)
`GET /api/assumptions` returns default params and allows UI sliders.

---

## UI pages / components

### New page: `/simulate`
- Game selector (date)
- Speed selector (10x/30x/60x)
- Bucket selector (1min/5min)
- Sliders:
  - registers per stand (global default + optional per-stand override)
  - service rate per register
  - wait_scale
- ArenaMap component: color by crowd_index
- Tiles per stand: wait_minutes, orders/min, top items
- A sparkline chart for last N buckets per stand

### New page: `/fan`
- Seat zone selector (or seat number input mapped to zone)
- Desired item input (autocomplete from DB distinct items)
- Max time input (e.g., 10 minutes)
- Results cards (top 3 stands + alternatives)

---

## Implementation steps (high priority order)

1) DB seed enhancements:
- Ensure transactions include `timestamp` (ISO string)
- Build item_availability table (distinct item/location)
- Create seat_zones + zone_distances tables with a simple default config

2) Simulation bucket builder:
- Function: load transactions for date
- group into bucket_start intervals
- compute per-bucket location aggregates
- compute rolling window lambda per location

3) SSE endpoint:
- stream bucket aggregates at chosen speed

4) Arena map rendering:
- map crowd_index -> color intensity
- tooltips show wait estimate + top items

5) Fan recommend endpoint:
- compute total time for desired item across stands
- return recommendations and alternatives

6) Optional polish:
- caching bucket list per selected date
- replay controls: pause, resume, jump to intermission
- pre/post-game period markers

---

## Assumptions configuration (defaults)
- bucket_size: 300 seconds (5 minutes)
- rolling_window: 300 seconds (5 minutes)
- registers per stand: 2
- service_rate_per_register: 0.6 orders/min (100 sec/order)
- walk_speed: 80 meters/min
- wait_scale: 12 minutes
These must be adjustable in UI to demonstrate tuning and realism.

---

## Messaging for judges (business + realism)
- “We replay POS demand as a live signal and estimate congestion from order throughput.”
- “Our wait-time model is configurable and becomes more accurate with staffing/register telemetry.”
- “Fan routing reduces missed game time and can increase conversion by directing fans to faster stands.”

---

## Guardrails
- Clearly label all wait times as **Estimated**
- Do not claim real-time queue length without sensor/staffing integration
- Keep the AI page read-only and sandboxed (no arbitrary SQL writes)

---

## Acceptance criteria (demo-ready)
- Pick a game day → simulation runs → map colors change over time
- Stand cards update each tick with demand + estimated wait
- Fan selects seat zone + item → gets recommended stand + return-time estimate
- If max time too low → alternatives appear

END
