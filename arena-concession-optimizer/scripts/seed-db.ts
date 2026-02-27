import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.resolve(__dirname, '../data/arena.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Remove existing DB
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ---------- Create Schema ----------
db.exec(`
  CREATE TABLE games (
    game_id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_date TEXT NOT NULL,
    opponent TEXT,
    attendance INTEGER,
    day_of_week TEXT,
    season TEXT
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER REFERENCES games(game_id),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    category TEXT,
    item TEXT,
    qty INTEGER,
    price_point TEXT,
    location TEXT,
    is_refund BOOLEAN DEFAULT FALSE
  );

  CREATE TABLE upcoming_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_date TEXT NOT NULL,
    opponent TEXT NOT NULL,
    game_time TEXT,
    predicted_attendance INTEGER,
    day_of_week TEXT
  );

  CREATE INDEX idx_transactions_location ON transactions(location);
  CREATE INDEX idx_transactions_game_id ON transactions(game_id);
  CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
  CREATE INDEX idx_transactions_category ON transactions(category);
  CREATE INDEX idx_transactions_date ON transactions(date);
  CREATE INDEX idx_games_date ON games(game_date);
`);

// ---------- Parse GameDetails.xlsx ----------
console.log('Parsing GameDetails.xlsx...');
const gameWb = xlsx.readFile(path.join(DATA_DIR, 'GameDetails.xlsx'));
const gameWs = gameWb.Sheets[gameWb.SheetNames[0]];
const gameRows = xlsx.utils.sheet_to_json(gameWs) as any[];

const insertGame = db.prepare(
  'INSERT INTO games (game_date, opponent, attendance, day_of_week, season) VALUES (?, ?, ?, ?, ?)'
);

const dayMap: Record<string, string> = {
  'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
  'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday',
  'Fir': 'Friday' // typo in data
};

const gameDateToId = new Map<string, number>();

const insertGames = db.transaction(() => {
  for (const row of gameRows) {
    if (row.Event === 'Event' || typeof row['Date, 2024/25 Season'] !== 'number') continue;

    const serial = row['Date, 2024/25 Season'];
    const d = xlsx.SSF.parse_date_code(serial);
    const dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;

    const dayAbbr = row.Day || '';
    const fullDay = dayMap[dayAbbr] || dayAbbr;

    // Determine season: Sep-Apr of year = YYYY-YY+1
    const season = d.m >= 9 ? `${d.y}-${String(d.y + 1).slice(2)}` : `${d.y - 1}-${String(d.y).slice(2)}`;

    const info = insertGame.run(dateStr, row.Event, row['Attendance - Scanned'] || null, fullDay, season);
    gameDateToId.set(dateStr, info.lastInsertRowid as number);
  }
});
insertGames();
console.log(`Inserted ${gameDateToId.size} games`);

// ---------- Parse CSV Files ----------
console.log('Parsing CSV files...');

const csvFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('items-') && f.endsWith('.csv')).sort();

const insertTx = db.prepare(
  'INSERT INTO transactions (game_id, date, time, timestamp, category, item, qty, price_point, location, is_refund) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

// Clean location name: remove "SOFMC " prefix
function cleanLocation(loc: string): string {
  return loc.replace(/^SOFMC\s+/, '').trim();
}

let totalInserted = 0;
let totalSkipped = 0;

const insertTransactions = db.transaction(() => {
  for (const csvFile of csvFiles) {
    const filePath = path.join(DATA_DIR, csvFile);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    let fileCount = 0;
    for (const row of records) {
      const category = row['Category'];
      const item = row['Item'];

      // Skip test data
      if (category === 'None' && item === 'TTT TEST') {
        totalSkipped++;
        continue;
      }

      const date = row['Date'];
      const time = row['Time'];
      const qty = parseInt(row['Qty'], 10);
      const pricePoint = row['Price Point Name'] || null;
      const location = cleanLocation(row['Location']);
      const isRefund = qty < 0;
      const timestamp = `${date}T${time}`;

      // Find the game for this date
      const gameId = gameDateToId.get(date) || null;

      insertTx.run(gameId, date, time, timestamp, category, item, qty, pricePoint, location, isRefund ? 1 : 0);
      fileCount++;
    }
    totalInserted += fileCount;
    console.log(`  ${csvFile}: ${fileCount} records`);
  }
});
insertTransactions();
console.log(`Total inserted: ${totalInserted}, skipped: ${totalSkipped}`);

// ---------- Insert Upcoming Games ----------
console.log('Inserting upcoming games...');

// Compute average attendance by opponent and day of week from historical data
const avgAttendance = db.prepare(`
  SELECT opponent, day_of_week, CAST(AVG(attendance) AS INTEGER) as avg_att
  FROM games WHERE attendance IS NOT NULL
  GROUP BY opponent, day_of_week
`).all() as any[];

const attMap = new Map<string, number>();
for (const row of avgAttendance) {
  attMap.set(`${row.opponent}|${row.day_of_week}`, row.avg_att);
}

// Overall average by day of week
const avgByDay = db.prepare(`
  SELECT day_of_week, CAST(AVG(attendance) AS INTEGER) as avg_att
  FROM games WHERE attendance IS NOT NULL
  GROUP BY day_of_week
`).all() as any[];
const dayAttMap = new Map<string, number>();
for (const row of avgByDay) {
  dayAttMap.set(row.day_of_week, row.avg_att);
}

const overallAvg = db.prepare('SELECT CAST(AVG(attendance) AS INTEGER) as avg FROM games WHERE attendance IS NOT NULL').get() as any;

const upcomingGames = [
  { date: '2026-02-27', opponent: 'Portland', time: '7:05 PM', day: 'Friday' },
  { date: '2026-02-28', opponent: 'Portland', time: '4:05 PM', day: 'Saturday' },
  { date: '2026-03-13', opponent: 'Vancouver', time: '7:05 PM', day: 'Friday' },
  { date: '2026-03-17', opponent: 'Everett', time: '7:05 PM', day: 'Tuesday' },
  { date: '2026-03-20', opponent: 'Prince George', time: '7:05 PM', day: 'Friday' },
  { date: '2026-03-21', opponent: 'Prince George', time: '6:05 PM', day: 'Saturday' },
];

const insertUpcoming = db.prepare(
  'INSERT INTO upcoming_games (game_date, opponent, game_time, predicted_attendance, day_of_week) VALUES (?, ?, ?, ?, ?)'
);

for (const g of upcomingGames) {
  const predicted = attMap.get(`${g.opponent}|${g.day}`)
    || dayAttMap.get(g.day)
    || overallAvg?.avg
    || 3000;
  insertUpcoming.run(g.date, g.opponent, g.time, predicted, g.day);
}
console.log(`Inserted ${upcomingGames.length} upcoming games`);

// ---------- Summary ----------
const txCount = (db.prepare('SELECT COUNT(*) as c FROM transactions').get() as any).c;
const gameCount = (db.prepare('SELECT COUNT(*) as c FROM games').get() as any).c;
const locationCount = (db.prepare('SELECT COUNT(DISTINCT location) as c FROM transactions').get() as any).c;

console.log('\n--- Summary ---');
console.log(`Games: ${gameCount}`);
console.log(`Transactions: ${txCount}`);
console.log(`Locations: ${locationCount}`);

// List locations
const locations = db.prepare('SELECT DISTINCT location FROM transactions ORDER BY location').all() as any[];
console.log('Locations:', locations.map(l => l.location).join(', '));

db.close();
console.log(`\nDatabase saved to ${DB_PATH}`);
