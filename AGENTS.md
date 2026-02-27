# Fan-Facing "Where Should I Go?" — Mobile Concession Finder

## Context

The Arena Concession Optimizer dashboard already serves management with analytics. The single smartest addition is flipping the perspective: a **mobile-first, fan-facing page** where customers scan a QR code at Save-On-Foods Memorial Centre and instantly see which concession stand has the shortest wait, what's popular there, and get a personalized recommendation based on what they're craving.

**Why this is the most impactful single feature:**
- **Innovation**: Two-sided platform (management + fan experience) — most hackathon projects only serve one audience
- **Technical**: Uses M/M/c queueing theory to estimate real wait times from transaction data
- **Business**: Reduces queue abandonment (fans go to shorter lines → more sales captured), improves fan satisfaction, creates a measurable engagement channel
- **Presentation**: Demo a phone scanning a QR code → live arena map with wait times. Judges can try it themselves.

## What Gets Built

A new mobile-optimized route (`/fan`) with its own layout (no sidebar), containing:

### 1. Live Arena Map with Wait Times
The existing SVG arena map, redesigned for mobile — vertical layout, large touch targets. Each concession shows an estimated wait time badge (e.g., "~2 min", "~6 min"). Tap a location to expand details.

### 2. "What Do You Want?" Quick Filter
Tap a craving: Beer, Food, Pizza, Snacks, Drinks. The map and list instantly re-rank to show which stands serve that category and which has the shortest wait for it.

### 3. Ranked Location Cards
Below the map, scrollable cards for each location sorted by estimated wait time (shortest first). Each card shows:
- Location name + estimated wait (color-coded green/amber/red)
- Top 3 popular items at that stand
- Category badges (Beer, Food, etc.)
- "Walk here" suggestion based on position

### 4. Smart Recommendation Banner
Top of page: "Craving beer? **Phillips Bar** has the shortest wait right now (~1.5 min)" — changes based on selected filter and current predictions.

### 5. QR Code Generator (on management side)
A small component on the predictions page that generates a QR code linking to `/fan?game=2026-02-27` for tonight's game. Management prints/displays it at arena entrances.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/queueing.ts` | **Create** | M/M/c model for wait time estimation |
| `src/lib/queries.ts` | **Modify** | Add demand curve + category-by-location queries |
| `src/app/api/fan/route.ts` | **Create** | Returns fan-facing data: wait times, top items, recommendations |
| `src/app/fan/layout.tsx` | **Create** | Mobile-only layout (no sidebar, full-width) |
| `src/app/fan/page.tsx` | **Create** | The fan-facing "Where Should I Go?" page |
| `src/app/predictions/page.tsx` | **Modify** | Add QR code linking to /fan for tonight's game |
| `src/components/layout/sidebar.tsx` | **Modify** | Add /fan nav entry |

## Implementation Steps

### Step 1: Queueing Model (`src/lib/queueing.ts`)

Pure math module — the technical backbone. Implements M/M/c queueing theory to convert historical transaction rates into wait time estimates.

**Functions:**
- `factorial(n)` — helper
- `erlangC(lambda, mu, c)` — probability a customer waits (Erlang C formula)
- `expectedWaitTime(lambda, mu, c)` — average wait time in minutes
- `estimateWaitForLocation(arrivalRate, categoryMix, staffCount)` — combines service rate from category mix with arrival rate to produce wait estimate

**Key parameters:**
- **lambda (arrival rate)**: items/minute during current period, from historical 10-min bucket data
- **mu (service rate)**: items/minute per staff member, blended from category mix at each location
- **c (servers)**: assumed staff count per location (estimated from historical throughput patterns)

**Service time assumptions by category:**
```
Beer/Wine/Liquor: ~45 sec/item (mu ≈ 1.33/min)
Food (cooked):    ~60 sec/item (mu ≈ 1.0/min)
Snacks/NA Bev:    ~20 sec/item (mu ≈ 3.0/min)
```

**M/M/c formulas:**
```
ρ = λ/(c×μ)              — utilization
P(wait) = Erlang C       — probability of queueing
W_q = P(wait)/(c×μ - λ)  — expected wait time
```

### Step 2: New Queries (add to `src/lib/queries.ts`)

**`getDemandCurve(opponent, dayOfWeek)`** — 10-minute bucket demand per location:
```sql
SELECT t.location,
  CAST(SUBSTR(t.time, 1, 2) AS INTEGER) as hour,
  (CAST(SUBSTR(t.time, 4, 2) AS INTEGER) / 10) * 10 as min_bucket,
  CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items
FROM transactions t
JOIN games g ON t.game_id = g.game_id
WHERE t.is_refund = 0 AND (g.opponent = ? OR g.day_of_week = ?)
GROUP BY t.location, hour, min_bucket
ORDER BY t.location, hour, min_bucket
```

**`getCategoryMixForFan(opponent, dayOfWeek)`** — category distribution per location (for blended service rate):
```sql
SELECT t.location, t.category,
  CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items
FROM transactions t
JOIN games g ON t.game_id = g.game_id
WHERE t.is_refund = 0 AND (g.opponent = ? OR g.day_of_week = ?)
GROUP BY t.location, t.category
```

**`getLocationCategories()`** — which categories each location serves (for "what do you want?" filter):
```sql
SELECT location, category, SUM(qty) as total
FROM transactions WHERE is_refund = 0
GROUP BY location, category
HAVING total > 100
ORDER BY location, total DESC
```

### Step 3: Fan API Route (`src/app/api/fan/route.ts`)

GET with params: `opponent`, `dayOfWeek`, `gameTime` (e.g., "19:05"), `category` (optional filter).

**Processing logic:**
1. Fetch demand curve, category mix, top items per location, location categories
2. Determine "current" time bucket based on game time (for the demo, use relative game period — pre-game, 1st period, intermission, etc.)
3. For each location:
   - Get arrival rate (lambda) from matching time bucket
   - Compute blended service rate (mu) from category mix
   - Estimate staff count from historical throughput (peak orders/min ÷ reasonable service rate)
   - Run queueing model → estimated wait time
4. If category filter is set, only include locations that serve that category; re-rank by wait
5. Generate recommendation: location with shortest wait for the selected category

**Returns:**
```typescript
{
  game: { opponent, day, time },
  currentPeriod: "1st Intermission",
  locations: [{
    name: string,
    waitMinutes: number,        // from queueing model
    trafficLevel: "low" | "medium" | "high",
    topItems: [{ item, category, qty }],
    categories: string[],       // what they serve
    position: { x, y, side },   // for arena map
  }],
  recommendation: {
    location: string,
    reason: string,             // "Shortest wait for Beer"
    waitMinutes: number,
  },
  gameMoments: [{ time, label, active }],  // timeline context
}
```

### Step 4: Mobile Layout (`src/app/fan/layout.tsx`)

A separate layout with **no sidebar** — full-screen mobile experience:
- Dark header bar with Victoria Royals branding
- Bottom pill showing current game period
- No desktop navigation — this is phone-only
- Safe area padding for notches
- Meta viewport for proper mobile scaling

### Step 5: Fan Page (`src/app/fan/page.tsx`)

**Visual layout (top to bottom on mobile):**

**A. Header** — Dark bar: "Save-On-Foods Memorial Centre" + game info (opponent, period)

**B. Smart Recommendation Banner** — Gradient card at top:
> "Shortest wait right now: **Portable Stations** (~1.5 min)"
> Or with filter: "Best for Beer: **Phillips Bar** (~2 min)"

**C. Category Quick-Filter** — Horizontally scrollable pill buttons:
`[All] [Beer] [Food] [Pizza] [Snacks] [Drinks]`
Tapping a pill filters the map and list. "All" shows overall shortest wait.

**D. Arena Map (Mobile-Optimized)** — Same SVG concept but:
- Taller aspect ratio for phone screens (viewBox adjusted)
- Each location circle shows wait time inside (e.g., "2m", "5m")
- Traffic color coding (green < 2 min, amber 2-5 min, red 5+ min)
- Tap a circle → scrolls to that location's card below

**E. Ranked Location Cards** — Sorted by wait time (shortest first):
```
┌─────────────────────────────────┐
│ 🟢 Portable Stations    ~1.5 min │
│ Popular: Popcorn, Hot Dogs       │
│ [Beer] [Snacks] [NA Bev]        │
├─────────────────────────────────┤
│ 🟡 Phillips Bar          ~3 min │
│ Popular: Draft Beer, Cans       │
│ [Beer] [Wine] [Liquor]          │
├─────────────────────────────────┤
│ 🔴 Island Canteen        ~6 min │
│ Popular: Cans of Beer, Fries    │
│ [Beer] [Food] [NA Bev] [Snacks] │
└─────────────────────────────────┘
```

**F. Game Timeline** — Horizontal bar at bottom showing periods with current period highlighted.

### Step 6: QR Code on Predictions Page

Add a small card to the existing predictions page:
- Generate QR code (use `qrcode` npm package or inline SVG)
- Points to: `https://<host>/fan?opponent=Portland&dayOfWeek=Friday&gameTime=19:05`
- Label: "Print this QR code for fans to find the shortest line"

### Step 7: Sidebar Update

Add `/fan` to sidebar nav with a distinctive icon — this is the "consumer-facing" counterpart.

## Game Period Logic

Map clock time to game periods based on game start time (most games 7:05 PM):
```
Doors Open:       gameTime - 90 min
Pre-Game:         gameTime - 60 min to gameTime
1st Period:       gameTime to gameTime + 20 min
1st Intermission: gameTime + 20 to gameTime + 38 min
2nd Period:       gameTime + 38 to gameTime + 58 min
2nd Intermission: gameTime + 58 to gameTime + 76 min
3rd Period:       gameTime + 76 to gameTime + 96 min
Post-Game:        gameTime + 96 min onward
```

For the demo/hackathon, allow a `period` query param to simulate different periods.

## Verification

1. `npm run build` — no type errors
2. Navigate to `/fan` on mobile viewport (Chrome DevTools → phone)
3. Category filter updates map and card rankings
4. Wait times are in realistic range (1-8 minutes)
5. Tapping arena map location scrolls to matching card
6. QR code on predictions page is scannable and links to `/fan`
7. Test with different `period` params to see how recommendations shift between intermissions (high demand) vs. periods (low demand)
