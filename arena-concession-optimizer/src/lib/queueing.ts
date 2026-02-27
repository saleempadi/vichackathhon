/**
 * M/M/c Queueing Theory Model
 * Converts historical transaction rates into estimated wait times per concession stand.
 */

// Service time assumptions (items per minute per server)
export const SERVICE_RATES: Record<string, number> = {
  'Beer': 1.33,                    // ~45 sec/item
  'Wine Cider & Coolers': 1.33,
  'Liquor': 1.33,
  'Food': 1.0,                     // ~60 sec/item
  'Food - Walking Taco': 1.0,
  'Snacks': 3.0,                   // ~20 sec/item
  'Snack': 3.0,
  'NA Bev': 3.0,
  'NA Bev PST Exempt': 3.0,
  'Sweets': 3.0,
  'Extras': 3.0,
};

const DEFAULT_SERVICE_RATE = 1.5; // items/min fallback

export function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Erlang C formula — probability that an arriving customer must wait.
 * @param lambda - arrival rate (items/min)
 * @param mu - service rate per server (items/min)
 * @param c - number of servers
 */
export function erlangC(lambda: number, mu: number, c: number): number {
  const rho = lambda / (c * mu);
  if (rho >= 1) return 1; // system is overloaded

  const a = lambda / mu; // offered load
  const numerator = (Math.pow(a, c) / factorial(c)) * (1 / (1 - rho));

  let sumTerms = 0;
  for (let k = 0; k < c; k++) {
    sumTerms += Math.pow(a, k) / factorial(k);
  }
  sumTerms += numerator;

  return numerator / sumTerms;
}

/**
 * Expected wait time in queue (minutes) using M/M/c model.
 * @param lambda - arrival rate (items/min)
 * @param mu - service rate per server (items/min)
 * @param c - number of servers
 */
export function expectedWaitTime(lambda: number, mu: number, c: number): number {
  if (lambda <= 0) return 0;
  if (c <= 0) return 10; // no servers = long wait

  const rho = lambda / (c * mu);
  if (rho >= 0.99) return 10; // cap at 10 min for near-overloaded systems

  const pWait = erlangC(lambda, mu, c);
  const wq = pWait / (c * mu - lambda); // expected wait in queue (minutes)

  return Math.max(0, Math.min(wq, 10)); // clamp 0-10 min
}

/**
 * Compute blended service rate from category mix at a location.
 * @param categoryMix - array of { category, avg_items } for this location
 */
export function blendedServiceRate(categoryMix: { category: string; avg_items: number }[]): number {
  const total = categoryMix.reduce((s, c) => s + c.avg_items, 0);
  if (total === 0) return DEFAULT_SERVICE_RATE;

  let weightedRate = 0;
  for (const c of categoryMix) {
    const rate = SERVICE_RATES[c.category] ?? DEFAULT_SERVICE_RATE;
    weightedRate += (c.avg_items / total) * rate;
  }
  return weightedRate;
}

/**
 * Estimate staff count from historical peak throughput.
 * Arena concession stands typically have 2-5 staff. We use peak throughput
 * to estimate, with a factor that accounts for items per transaction (~2.5)
 * and that not all staff serve simultaneously.
 */
export function estimateStaffCount(peakItemsPerMinute: number, serviceRate: number): number {
  // Peak items/min represents what was actually processed, so theoretical staff =
  // peakItemsPerMinute / serviceRate. But real stands have fewer staff working
  // simultaneously (breaks, restocking, etc). Use ~55% factor.
  const estimated = Math.round((peakItemsPerMinute / serviceRate) * 0.55);
  return Math.max(1, Math.min(estimated, 6)); // clamp 1-6 staff per stand
}

export interface WaitEstimate {
  location: string;
  waitMinutes: number;
  trafficLevel: 'low' | 'medium' | 'high';
  arrivalRate: number;
  serviceRate: number;
  staffCount: number;
}

/**
 * Full wait time estimation for a location.
 */
export function estimateWaitForLocation(
  location: string,
  arrivalRate: number,
  categoryMix: { category: string; avg_items: number }[],
  peakItemsPerMinute: number,
): WaitEstimate {
  const mu = blendedServiceRate(categoryMix);
  const c = estimateStaffCount(peakItemsPerMinute, mu);
  const wait = expectedWaitTime(arrivalRate, mu, c);

  // Round to 1 decimal
  const waitMinutes = Math.round(wait * 10) / 10;

  let trafficLevel: 'low' | 'medium' | 'high' = 'low';
  if (waitMinutes >= 5) trafficLevel = 'high';
  else if (waitMinutes >= 2) trafficLevel = 'medium';

  return {
    location,
    waitMinutes,
    trafficLevel,
    arrivalRate,
    serviceRate: mu,
    staffCount: c,
  };
}
