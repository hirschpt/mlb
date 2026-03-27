// lib/oddsApi.js
// The Odds API — free tier: 500 credits/month. Sign up at the-odds-api.com
// Each MLB odds call costs ~15 credits (one per bookmaker returned).
// 500 credits = ~33 calls/month on free tier. Plenty for daily use.

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

// US sportsbooks we care about — filter to ones user likely has access to
export const US_BOOKS = [
  { key: 'draftkings',   name: 'DraftKings',   url: 'https://sportsbook.draftkings.com' },
  { key: 'fanduel',      name: 'FanDuel',       url: 'https://sportsbook.fanduel.com' },
  { key: 'betmgm',       name: 'BetMGM',        url: 'https://sports.betmgm.com' },
  { key: 'caesars',      name: 'Caesars',        url: 'https://www.caesars.com/sportsbook-and-casino' },
  { key: 'bovada_us',    name: 'Bovada',         url: 'https://www.bovada.lv/sports/baseball/mlb' },
  { key: 'betonlineag',  name: 'BetOnline',      url: 'https://www.betonline.ag/sportsbook/baseball/mlb' },
  { key: 'mybookieag',   name: 'MyBookie',       url: 'https://mybookie.ag/sportsbook/baseball' },
  { key: 'espnbet',      name: 'ESPN BET',       url: 'https://espnbet.com/sport/baseball' },
  { key: 'pointsbetus',  name: 'PointsBet',      url: 'https://pointsbet.com/sports/baseball' },
  { key: 'williamhill_us', name: 'WilliamHill',  url: 'https://www.williamhill.com/us/sportsbook' },
]

const BOOK_MAP = Object.fromEntries(US_BOOKS.map(b => [b.key, b]))

/**
 * Fetch live moneyline odds for all today's MLB games from The Odds API.
 * Returns a map keyed by a normalized matchup string.
 */
export async function getMLBOdds(apiKey) {
  if (!apiKey) return null

  const url = `${ODDS_API_BASE}/sports/baseball_mlb/odds?` +
    `apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h` +           // moneyline only (cheapest, most relevant)
    `&oddsFormat=american` +
    `&bookmakers=${US_BOOKS.map(b => b.key).join(',')}`

  const res = await fetch(url, { next: { revalidate: 600 } }) // cache 10 min

  if (res.status === 401) throw new Error('Invalid Odds API key')
  if (res.status === 422) throw new Error('Odds API quota exceeded')
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)

  const games = await res.json()

  // Log remaining credits if header present
  const remaining = res.headers.get('x-requests-remaining')
  const used = res.headers.get('x-requests-used')
  console.log(`Odds API — used: ${used}, remaining: ${remaining}`)

  // Build a map: "away_team|home_team" -> structured odds data
  const oddsMap = {}

  for (const game of games) {
    const key = normalizeMatchupKey(game.away_team, game.home_team)

    const bookOdds = []
    for (const bookmaker of (game.bookmakers || [])) {
      const h2h = bookmaker.markets?.find(m => m.key === 'h2h')
      if (!h2h) continue

      const awayOutcome = h2h.outcomes.find(o => o.name === game.away_team)
      const homeOutcome = h2h.outcomes.find(o => o.name === game.home_team)

      if (!awayOutcome || !homeOutcome) continue

      bookOdds.push({
        bookKey: bookmaker.key,
        bookName: BOOK_MAP[bookmaker.key]?.name || bookmaker.title,
        bookUrl: BOOK_MAP[bookmaker.key]?.url || null,
        awayOdds: awayOutcome.price,
        homeOdds: homeOutcome.price,
        lastUpdate: bookmaker.last_update,
      })
    }

    if (bookOdds.length === 0) continue

    oddsMap[key] = {
      awayTeam: game.away_team,
      homeTeam: game.home_team,
      commenceTime: game.commence_time,
      books: bookOdds,
      ...deriveOddsInsights(bookOdds, game.away_team, game.home_team),
    }
  }

  return oddsMap
}

/** Normalize two team names into a stable map key */
function normalizeMatchupKey(away, home) {
  return `${away.toLowerCase().replace(/\s+/g, '_')}|${home.toLowerCase().replace(/\s+/g, '_')}`
}

export function findOddsForGame(oddsMap, awayTeam, homeTeam) {
  if (!oddsMap) return null
  const key = normalizeMatchupKey(awayTeam, homeTeam)
  if (oddsMap[key]) return oddsMap[key]

  // Fuzzy fallback: try matching on last word of team name (e.g. "Yankees")
  for (const [k, v] of Object.entries(oddsMap)) {
    const awayLast = awayTeam.split(' ').pop().toLowerCase()
    const homeLast = homeTeam.split(' ').pop().toLowerCase()
    if (k.includes(awayLast) && k.includes(homeLast)) return v
  }
  return null
}

/**
 * From all book odds, derive:
 * - Best available price for each side + which book offers it
 * - Consensus / fair line (average of all books, vig-removed)
 * - Line spread (max - min) as a signal of market disagreement
 * - Whether the price passes the strategy filter (≤ -150)
 */
function deriveOddsInsights(books, awayTeam, homeTeam) {
  const awayPrices = books.map(b => b.awayOdds)
  const homePrices = books.map(b => b.homeOdds)

  const bestAwayIdx = awayPrices.indexOf(Math.max(...awayPrices))
  const bestHomeIdx = homePrices.indexOf(Math.max(...homePrices))

  const bestAway = {
    odds: awayPrices[bestAwayIdx],
    book: books[bestAwayIdx].bookName,
    bookUrl: books[bestAwayIdx].bookUrl,
    bookKey: books[bestAwayIdx].bookKey,
  }
  const bestHome = {
    odds: homePrices[bestHomeIdx],
    book: books[bestHomeIdx].bookName,
    bookUrl: books[bestHomeIdx].bookUrl,
    bookKey: books[bestHomeIdx].bookKey,
  }

  // Consensus fair line (simple average, vig-aware)
  const avgAway = Math.round(awayPrices.reduce((a, b) => a + b, 0) / awayPrices.length)
  const avgHome = Math.round(homePrices.reduce((a, b) => a + b, 0) / homePrices.length)

  // Line spread: wider = more disagreement = potentially more exploitable
  const awaySpread = Math.max(...awayPrices) - Math.min(...awayPrices)
  const homeSpread = Math.max(...homePrices) - Math.min(...homePrices)

  // Strategy check: is best available price within -150 threshold?
  const awayPassesFilter = bestAway.odds >= -150
  const homePassesFilter = bestHome.odds >= -150

  return {
    bestAway,
    bestHome,
    consensusAway: avgAway,
    consensusHome: avgHome,
    awaySpread,
    homeSpread,
    awayPassesFilter,
    homePassesFilter,
    bookCount: books.length,
  }
}

/** Format American odds for display: +125 or -140 */
export function fmtOdds(n) {
  if (n === null || n === undefined) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

/** Convert American odds to implied probability % */
export function impliedProb(american) {
  if (american > 0) return (100 / (american + 100)) * 100
  return (Math.abs(american) / (Math.abs(american) + 100)) * 100
}
