import { getDb } from './db';

// ---- Overview KPIs ----
export function getOverviewKPIs() {
  const db = getDb();
  const totalGames = db.prepare('SELECT COUNT(*) as v FROM games').get() as any;
  const totalItems = db.prepare('SELECT SUM(qty) as v FROM transactions WHERE is_refund = 0').get() as any;
  const totalOrders = db.prepare(`
    SELECT COUNT(DISTINCT date || time || location) as v FROM transactions WHERE is_refund = 0
  `).get() as any;
  const avgItemsPerGame = db.prepare(`
    SELECT CAST(SUM(qty) AS REAL) / COUNT(DISTINCT game_id) as v
    FROM transactions WHERE is_refund = 0 AND game_id IS NOT NULL
  `).get() as any;
  const avgAttendance = db.prepare('SELECT CAST(AVG(attendance) AS INTEGER) as v FROM games WHERE attendance IS NOT NULL').get() as any;
  return {
    totalGames: totalGames.v,
    totalItems: totalItems.v,
    totalOrders: totalOrders.v,
    avgItemsPerGame: Math.round(avgItemsPerGame.v),
    avgAttendance: avgAttendance.v,
  };
}

// ---- Sales by Location ----
export function getSalesByLocation(filters?: { opponent?: string; dayOfWeek?: string }) {
  const db = getDb();
  let where = 'WHERE t.is_refund = 0';
  const params: any[] = [];
  if (filters?.opponent) {
    where += ' AND g.opponent = ?';
    params.push(filters.opponent);
  }
  if (filters?.dayOfWeek) {
    where += ' AND g.day_of_week = ?';
    params.push(filters.dayOfWeek);
  }
  return db.prepare(`
    SELECT t.location, SUM(t.qty) as total_items, COUNT(DISTINCT t.date || t.time || t.location) as total_orders
    FROM transactions t
    LEFT JOIN games g ON t.game_id = g.game_id
    ${where}
    GROUP BY t.location
    ORDER BY total_items DESC
  `).all(...params);
}

// ---- Sales Trend Over Season ----
export function getSalesTrend() {
  const db = getDb();
  return db.prepare(`
    SELECT g.game_date as date, g.opponent, g.attendance, SUM(t.qty) as total_items
    FROM transactions t
    JOIN games g ON t.game_id = g.game_id
    WHERE t.is_refund = 0
    GROUP BY g.game_id
    ORDER BY g.game_date
  `).all();
}

// ---- Top Items ----
export function getTopItems(limit = 10, location?: string) {
  const db = getDb();
  let where = 'WHERE is_refund = 0';
  const params: any[] = [];
  if (location) {
    where += ' AND location = ?';
    params.push(location);
  }
  return db.prepare(`
    SELECT item, category, SUM(qty) as total_qty, COUNT(*) as num_transactions
    FROM transactions
    ${where}
    GROUP BY item, category
    ORDER BY total_qty DESC
    LIMIT ?
  `).all(...params, limit);
}

// ---- Hourly Heatmap Data ----
export function getHourlyHeatmap() {
  const db = getDb();
  return db.prepare(`
    SELECT location, CAST(SUBSTR(time, 1, 2) AS INTEGER) as hour, SUM(qty) as total_items
    FROM transactions
    WHERE is_refund = 0
    GROUP BY location, hour
    ORDER BY location, hour
  `).all();
}

// ---- Category Breakdown by Location ----
export function getCategoryByLocation() {
  const db = getDb();
  return db.prepare(`
    SELECT location, category, SUM(qty) as total_items
    FROM transactions
    WHERE is_refund = 0
    GROUP BY location, category
    ORDER BY location, total_items DESC
  `).all();
}

// ---- Peak Throughput (orders/minute by location) ----
export function getPeakThroughput() {
  const db = getDb();
  return db.prepare(`
    SELECT location,
      CAST(SUBSTR(time, 1, 2) AS INTEGER) as hour,
      COUNT(DISTINCT date || SUBSTR(time, 1, 5) || location) as orders_per_min_window,
      COUNT(DISTINCT date || time || location) as unique_orders
    FROM transactions
    WHERE is_refund = 0
    GROUP BY location, hour
    ORDER BY unique_orders DESC
  `).all();
}

// ---- Attendance vs Sales ----
export function getAttendanceVsSales() {
  const db = getDb();
  return db.prepare(`
    SELECT g.game_date, g.opponent, g.attendance, g.day_of_week,
      SUM(t.qty) as total_items,
      COUNT(DISTINCT t.date || t.time || t.location) as total_orders
    FROM games g
    JOIN transactions t ON g.game_id = t.game_id
    WHERE t.is_refund = 0 AND g.attendance IS NOT NULL
    GROUP BY g.game_id
    ORDER BY g.attendance
  `).all();
}

// ---- Sales by Opponent ----
export function getSalesByOpponent() {
  const db = getDb();
  return db.prepare(`
    SELECT g.opponent, COUNT(DISTINCT g.game_id) as num_games,
      CAST(AVG(g.attendance) AS INTEGER) as avg_attendance,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items_per_game
    FROM games g
    JOIN transactions t ON g.game_id = t.game_id
    WHERE t.is_refund = 0 AND g.attendance IS NOT NULL
    GROUP BY g.opponent
    ORDER BY avg_items_per_game DESC
  `).all();
}

// ---- Sales by Day of Week ----
export function getSalesByDayOfWeek() {
  const db = getDb();
  return db.prepare(`
    SELECT g.day_of_week, COUNT(DISTINCT g.game_id) as num_games,
      CAST(AVG(g.attendance) AS INTEGER) as avg_attendance,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items_per_game
    FROM games g
    JOIN transactions t ON g.game_id = t.game_id
    WHERE t.is_refund = 0 AND g.day_of_week IS NOT NULL
    GROUP BY g.day_of_week
    ORDER BY avg_items_per_game DESC
  `).all();
}

// ---- Game Period Timeline ----
export function getGamePeriodTimeline() {
  const db = getDb();
  // Approximate game periods by time relative to typical 7pm puck drop
  return db.prepare(`
    SELECT
      CASE
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) < 18 THEN 'Pre-Game (Early)'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) = 18 THEN 'Pre-Game'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) = 19 AND CAST(SUBSTR(time, 4, 2) AS INTEGER) < 20 THEN '1st Period'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) = 19 AND CAST(SUBSTR(time, 4, 2) AS INTEGER) >= 20 THEN '1st Intermission'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) = 20 AND CAST(SUBSTR(time, 4, 2) AS INTEGER) < 10 THEN '2nd Period'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) = 20 AND CAST(SUBSTR(time, 4, 2) AS INTEGER) >= 10 AND CAST(SUBSTR(time, 4, 2) AS INTEGER) < 40 THEN '2nd Intermission'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) = 20 AND CAST(SUBSTR(time, 4, 2) AS INTEGER) >= 40 THEN '3rd Period'
        WHEN CAST(SUBSTR(time, 1, 2) AS INTEGER) >= 21 THEN '3rd Period / Post-Game'
        ELSE 'Other'
      END as period,
      SUM(qty) as total_items,
      COUNT(DISTINCT date || time || location) as total_orders
    FROM transactions
    WHERE is_refund = 0
    GROUP BY period
    ORDER BY
      CASE period
        WHEN 'Pre-Game (Early)' THEN 1
        WHEN 'Pre-Game' THEN 2
        WHEN '1st Period' THEN 3
        WHEN '1st Intermission' THEN 4
        WHEN '2nd Period' THEN 5
        WHEN '2nd Intermission' THEN 6
        WHEN '3rd Period' THEN 7
        WHEN '3rd Period / Post-Game' THEN 8
        ELSE 9
      END
  `).all();
}

// ---- Predictions for Upcoming Games ----
export function getUpcomingGames() {
  const db = getDb();
  return db.prepare('SELECT * FROM upcoming_games ORDER BY game_date').all();
}

export function getPredictionsForGame(opponent: string, dayOfWeek: string) {
  const db = getDb();
  // Get historical average by location for similar games
  return db.prepare(`
    SELECT t.location,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as predicted_items,
      COUNT(DISTINCT g.game_id) as sample_games
    FROM transactions t
    JOIN games g ON t.game_id = g.game_id
    WHERE t.is_refund = 0
      AND (g.opponent = ? OR g.day_of_week = ?)
    GROUP BY t.location
    ORDER BY predicted_items DESC
  `).all(opponent, dayOfWeek);
}

export function getStaffingRecommendation(opponent: string, dayOfWeek: string) {
  const db = getDb();
  // Peak hour analysis for staffing
  return db.prepare(`
    SELECT t.location,
      CAST(SUBSTR(t.time, 1, 2) AS INTEGER) as hour,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items_per_hour,
      CAST(COUNT(DISTINCT t.date || t.time || t.location) AS REAL) / COUNT(DISTINCT g.game_id) as avg_orders_per_hour
    FROM transactions t
    JOIN games g ON t.game_id = g.game_id
    WHERE t.is_refund = 0
      AND (g.opponent = ? OR g.day_of_week = ?)
    GROUP BY t.location, hour
    ORDER BY t.location, hour
  `).all(opponent, dayOfWeek);
}

// ---- Express Menu (high-burst items) ----
export function getExpressMenuSuggestions() {
  const db = getDb();
  return db.prepare(`
    SELECT item, category, SUM(qty) as total_qty,
      COUNT(DISTINCT date) as num_game_days,
      CAST(SUM(qty) AS REAL) / COUNT(DISTINCT date) as avg_per_game
    FROM transactions
    WHERE is_refund = 0
      AND CAST(SUBSTR(time, 1, 2) AS INTEGER) BETWEEN 19 AND 20
    GROUP BY item, category
    ORDER BY avg_per_game DESC
    LIMIT 15
  `).all();
}

// ---- Location Traffic for Arena Map ----
export function getLocationTraffic() {
  const db = getDb();
  return db.prepare(`
    SELECT location,
      SUM(qty) as total_items,
      COUNT(DISTINCT date || time || location) as total_orders,
      CAST(SUM(qty) AS REAL) / COUNT(DISTINCT game_id) as avg_items_per_game
    FROM transactions
    WHERE is_refund = 0 AND game_id IS NOT NULL
    GROUP BY location
    ORDER BY total_items DESC
  `).all();
}

// ---- Opponents List ----
export function getOpponents() {
  const db = getDb();
  return db.prepare('SELECT DISTINCT opponent FROM games ORDER BY opponent').all();
}

// ---- Fan-Facing Queries ----

/** 10-minute bucket demand per location for similar games */
export function getDemandCurve(opponent: string, dayOfWeek: string) {
  const db = getDb();
  return db.prepare(`
    SELECT t.location,
      CAST(SUBSTR(t.time, 1, 2) AS INTEGER) as hour,
      (CAST(SUBSTR(t.time, 4, 2) AS INTEGER) / 10) * 10 as min_bucket,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items
    FROM transactions t
    JOIN games g ON t.game_id = g.game_id
    WHERE t.is_refund = 0 AND (g.opponent = ? OR g.day_of_week = ?)
    GROUP BY t.location, hour, min_bucket
    ORDER BY t.location, hour, min_bucket
  `).all(opponent, dayOfWeek);
}

/** Category distribution per location for blended service rate */
export function getCategoryMixForFan(opponent: string, dayOfWeek: string) {
  const db = getDb();
  return db.prepare(`
    SELECT t.location, t.category,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_items
    FROM transactions t
    JOIN games g ON t.game_id = g.game_id
    WHERE t.is_refund = 0 AND (g.opponent = ? OR g.day_of_week = ?)
    GROUP BY t.location, t.category
  `).all(opponent, dayOfWeek);
}

/** Which categories each location serves (for "what do you want?" filter) */
export function getLocationCategories() {
  const db = getDb();
  return db.prepare(`
    SELECT location, category, SUM(qty) as total
    FROM transactions WHERE is_refund = 0
    GROUP BY location, category
    HAVING total > 100
    ORDER BY location, total DESC
  `).all();
}

/** Top items per location for fan cards */
export function getTopItemsByLocation(opponent: string, dayOfWeek: string) {
  const db = getDb();
  return db.prepare(`
    SELECT t.location, t.item, t.category,
      CAST(SUM(t.qty) AS REAL) / COUNT(DISTINCT g.game_id) as avg_qty
    FROM transactions t
    JOIN games g ON t.game_id = g.game_id
    WHERE t.is_refund = 0 AND (g.opponent = ? OR g.day_of_week = ?)
    GROUP BY t.location, t.item, t.category
    ORDER BY t.location, avg_qty DESC
  `).all(opponent, dayOfWeek);
}

// ---- Generic Query (for AI insights) ----
export function runQuery(sql: string) {
  const db = getDb();
  // Only allow SELECT queries
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }
  return db.prepare(sql).all();
}
