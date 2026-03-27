// lib/advancedStats.js
// Sources:
//   - Baseball Savant CSV leaderboard: free, no auth, real Statcast data
//   - MLB Stats API game log endpoint: free, no auth, real start-by-start data
//
// xFIP formula (FanGraphs):
//   xFIP = ((13 × (FB_allowed × lgHR_FB_rate)) + (3 × (BB + HBP)) - (2 × K)) / IP + FIP_constant
//   FIP constant ≈ 3.10 (stable year to year, we use 3.10 as default)

const SAVANT_BASE = 'https://baseballsavant.mlb.com'
const MLB_API = 'https://statsapi.mlb.com/api/v1'

// League-average HR/FB rate by season (FanGraphs historical, stable reference)
const LG_HR_FB = {
  2026: 0.117, // estimate based on 2024-25 trend
  2025: 0.117,
  2024: 0.116,
  2023: 0.121,
  2022: 0.114,
}
const FIP_CONSTANT = 3.10

/**
 * Fetch Baseball Savant pitcher leaderboard CSV for current season.
 * Returns a Map keyed by MLB player ID (as string) → savant stats object.
 * Includes: gb_percent, fb_percent, hard_hit_percent, barrel_percent, xwoba, xera
 *
 * The CSV endpoint is public and undocumented but stable — used by pybaseball.
 */
export async function fetchSavantLeaderboard(season) {
  const yr = season || new Date().getFullYear()
  // Custom leaderboard: pitcher type, current season, all pitchers
  const url =
    `${SAVANT_BASE}/leaderboard/custom` +
    `?year=${yr}` +
    `&type=pitcher` +
    `&filter=` +
    `&sort=xwoba` +
    `&sortDir=asc` +
    `&min=1` + // minimum 1 PA (gets everyone with any data)
    `&selections=` +
      `p_era,p_formatted_ip,p_k,p_bb,p_hbp,` + // basic
      `gb,fb,ld,` +                              // batted ball counts
      `p_game,p_quality_start,` +               // usage
      `xwoba,xera,` +                           // expected stats
      `hard_hit_percent,barrel_percent,` +       // quality of contact
      `p_k_percent,p_bb_percent` +              // rate stats
    `&chart=false&x=xwoba&y=xwoba&r=no&chartType=beeswarm` +
    `&csv=true`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'MLB-Analyzer/1.0' },
    next: { revalidate: 3600 }, // cache 1 hour
  })

  if (!res.ok) throw new Error(`Savant leaderboard error: ${res.status}`)

  const csv = await res.text()
  return parseSavantCsv(csv, yr)
}

function parseSavantCsv(csv, season) {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return new Map()

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const map = new Map()

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    if (values.length < headers.length) continue

    const row = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.replace(/"/g, '').trim()
    })

    const playerId = row['player_id'] || row['mlbam_id'] || row['pitcher']
    if (!playerId) continue

    const gb = parseFloat(row['gb']) || 0
    const fb = parseFloat(row['fb']) || 0
    const ld = parseFloat(row['ld']) || 0
    const totalBIP = gb + fb + ld
    const fbPct = totalBIP > 0 ? fb / totalBIP : 0

    const k = parseFloat(row['p_k']) || 0
    const bb = parseFloat(row['p_bb']) || 0
    const hbp = parseFloat(row['p_hbp']) || 0
    const ip = parseFloat(row['p_formatted_ip']) || 0

    const lgHrFb = LG_HR_FB[season] || 0.117

    // Calculate xFIP if we have enough data
    let xfip = null
    if (ip >= 5 && fb > 0) {
      const expectedHR = fb * lgHrFb
      xfip = parseFloat(
        (((13 * expectedHR) + (3 * (bb + hbp)) - (2 * k)) / ip + FIP_CONSTANT).toFixed(2)
      )
    }

    map.set(playerId.toString(), {
      playerId: playerId.toString(),
      gbPct: parseFloat(row['gb_percent'] || (totalBIP > 0 ? (gb / totalBIP * 100).toFixed(1) : null)),
      fbPct: parseFloat((fbPct * 100).toFixed(1)),
      hardHitPct: parseFloat(row['hard_hit_percent']) || null,
      barrelPct: parseFloat(row['barrel_percent']) || null,
      xwoba: parseFloat(row['xwoba']) || null,
      xera: parseFloat(row['xera']) || null,
      xfip,
      // Raw counts for xFIP verification
      raw: { gb, fb, ld, k, bb, hbp, ip },
    })
  }

  return map
}

// Handle quoted CSV fields with commas inside
function splitCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += char }
  }
  result.push(current)
  return result
}

/**
 * Fetch a pitcher's game log for the current season from the MLB Stats API.
 * Returns last N starts with real stats.
 */
export async function getPitcherGameLog(playerId, season, lastN = 5) {
  if (!playerId) return null
  const yr = season || new Date().getFullYear()

  const url =
    `${MLB_API}/people/${playerId}/stats` +
    `?stats=gameLog&group=pitching&season=${yr}&gameType=R`

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }) // cache 30 min
    if (!res.ok) return null

    const data = await res.json()
    const splits = data.stats?.[0]?.splits
    if (!splits || !splits.length) return null

    // Filter to starts only (GS > 0), sort most recent first
    const starts = splits
      .filter(s => s.stat?.gamesStarted > 0)
      .slice(-lastN) // last N
      .reverse()     // most recent first

    if (!starts.length) return null

    const formatted = starts.map(s => {
      const stat = s.stat
      const ip = parseFloat(stat.inningsPitched) || 0
      const er = stat.earnedRuns || 0
      const k = stat.strikeOuts || 0
      const bb = stat.baseOnBalls || 0
      const h = stat.hits || 0
      const date = s.date || s.game?.gameDate || ''

      return {
        date: date.slice(0, 10),
        opponent: s.opponent?.abbreviation || s.opponent?.name || '?',
        ip: ip.toFixed(1),
        er,
        k,
        bb,
        h,
        quality: ip >= 6 && er <= 3 ? 'QS' : ip < 5 ? 'SHORT' : 'OK',
        // Simple ERA for that start
        startEra: ip > 0 ? parseFloat(((er / ip) * 9).toFixed(2)) : null,
      }
    })

    // Rolling stats over last 5 starts
    const totalIP = starts.reduce((a, s) => a + (parseFloat(s.stat.inningsPitched) || 0), 0)
    const totalER = starts.reduce((a, s) => a + (s.stat.earnedRuns || 0), 0)
    const totalK = starts.reduce((a, s) => a + (s.stat.strikeOuts || 0), 0)
    const totalBB = starts.reduce((a, s) => a + (s.stat.baseOnBalls || 0), 0)

    const recentEra = totalIP > 0 ? parseFloat(((totalER / totalIP) * 9).toFixed(2)) : null
    const recentK9 = totalIP > 0 ? parseFloat(((totalK / totalIP) * 9).toFixed(1)) : null
    const recentBB9 = totalIP > 0 ? parseFloat(((totalBB / totalIP) * 9).toFixed(1)) : null
    const qs = formatted.filter(s => s.quality === 'QS').length

    return {
      starts: formatted,
      count: formatted.length,
      recentEra,
      recentK9,
      recentBB9,
      qualityStarts: qs,
      trend: assessTrend(formatted),
      summary: buildFormSummary(formatted, recentEra, recentK9, qs),
    }
  } catch {
    return null
  }
}

function assessTrend(starts) {
  if (starts.length < 3) return 'UNKNOWN'
  // Compare ERA of last 2 vs previous 2-3 starts
  const recent = starts.slice(0, 2)
  const older = starts.slice(2)
  const recentEra = avgEra(recent)
  const olderEra = avgEra(older)
  if (recentEra === null || olderEra === null) return 'UNKNOWN'
  if (recentEra < olderEra - 1.5) return 'IMPROVING'
  if (recentEra > olderEra + 1.5) return 'DECLINING'
  return 'STABLE'
}

function avgEra(starts) {
  const ip = starts.reduce((a, s) => a + parseFloat(s.ip), 0)
  const er = starts.reduce((a, s) => a + s.er, 0)
  return ip > 0 ? (er / ip) * 9 : null
}

function buildFormSummary(starts, recentEra, recentK9, qs) {
  if (!starts.length) return 'No starts this season'
  const n = starts.length
  const lines = starts.map(s =>
    `${s.date} vs ${s.opponent}: ${s.ip} IP, ${s.er} ER, ${s.k} K (${s.quality})`
  )
  return [
    `Last ${n} starts — ERA: ${recentEra ?? '—'}, K/9: ${recentK9 ?? '—'}, QS: ${qs}/${n}`,
    ...lines,
  ].join('\n')
}

/**
 * Detect line movement from The Odds API data.
 * The Odds API free tier doesn't include historical odds, but we can detect
 * movement by comparing books against each other:
 * - Sharp books (Pinnacle, Circa) vs soft books (public-facing books)
 * - If a sharp book is significantly off the consensus, that's signal
 *
 * For actual open → current movement, you'd need The Odds API's "historical" endpoints
 * (paid) or store snapshots yourself. We do the best we can with what's free.
 */
export function analyzeLineMovement(oddsData) {
  if (!oddsData?.books || oddsData.books.length < 3) {
    return {
      signal: 'INSUFFICIENT_DATA',
      summary: 'Not enough books to assess line movement',
      reverseLineMovement: false,
      spreadPts: null,
    }
  }

  const { books, bestAway, bestHome, consensusAway, consensusHome,
          awaySpread, homeSpread } = oddsData

  // Identify if there's meaningful disagreement between books
  const maxSpread = Math.max(awaySpread, homeSpread)
  const sharpSide = awaySpread > homeSpread ? 'away' : 'home'

  // Large spread between books (10+ points) = market disagreement = possibly sharp vs public
  const hasDisagreement = maxSpread >= 8

  // If one side's best price is significantly better than consensus, sharp books are on that side
  const awayVsConsensus = bestAway.odds - consensusAway
  const homeVsConsensus = bestHome.odds - consensusHome

  // Sharp signal: best book offers 8+ points better than consensus on one side
  // This means sharp books have moved the number on that side
  const sharpAwaySignal = awayVsConsensus >= 8
  const sharpHomeSignal = homeVsConsensus >= 8

  let signal = 'NONE'
  let rlm = false
  let summary = ''

  if (sharpAwaySignal && !sharpHomeSignal) {
    signal = 'SHARP_AWAY'
    rlm = true
    summary = `Best away price (${bestAway.odds > 0 ? '+' : ''}${bestAway.odds}) is ${awayVsConsensus} pts above consensus — sharp-book pressure on away side`
  } else if (sharpHomeSignal && !sharpAwaySignal) {
    signal = 'SHARP_HOME'
    rlm = true
    summary = `Best home price (${bestHome.odds > 0 ? '+' : ''}${bestHome.odds}) is ${homeVsConsensus} pts above consensus — sharp-book pressure on home side`
  } else if (hasDisagreement) {
    summary = `${maxSpread}-pt spread across books on ${sharpSide} side — market disagreement, watch for movement`
    signal = 'DISAGREEMENT'
  } else {
    summary = `Books aligned within ${maxSpread} pts — no strong sharp signal detected`
    signal = 'NONE'
  }

  return {
    signal,
    reverseLineMovement: rlm,
    sharpSide: sharpAwaySignal ? 'away' : sharpHomeSignal ? 'home' : null,
    awayVsConsensus,
    homeVsConsensus,
    maxBookSpread: maxSpread,
    summary,
    note: 'Line movement derived from book spread analysis. For tick-by-tick open→current movement, check Action Network PRO.',
  }
}
