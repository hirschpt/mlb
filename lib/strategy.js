// lib/strategy.js
// Beat the Book strategy rules - used server-side before Claude call

export const STRATEGY = {
  MAX_ODDS_TO_BET: -150,       // Never bet worse than -150
  MIN_CRITERIA_TO_BET: 3,      // Need at least 3 of 4 criteria

  PITCHER: {
    FADE_WHIP: 1.30,           // WHIP above this = fade candidate
    FADE_K9: 7,                // K/9 below this = fade candidate
    TARGET_WHIP: 1.20,         // WHIP below this = target
    TARGET_K9: 9,              // K/9 above this = target
  },

  BULLPEN: {
    EDGE_THRESHOLD: 1.3,       // ERA gap needed to call bullpen edge
  },
}

export function evaluatePitcher(stats, name) {
  if (!stats || stats.games < 3) {
    return {
      name: name || 'TBD',
      verdict: 'INSUFFICIENT_DATA',
      keyStats: stats ? `${stats.games} GS — too small a sample` : 'No stats available',
      edge: false,
    }
  }

  const { era, whip, k9 } = stats
  const isFade =
    whip !== null && k9 !== null &&
    whip > STRATEGY.PITCHER.FADE_WHIP &&
    k9 < STRATEGY.PITCHER.FADE_K9

  const isTarget =
    whip !== null && k9 !== null &&
    whip < STRATEGY.PITCHER.TARGET_WHIP &&
    k9 > STRATEGY.PITCHER.TARGET_K9

  return {
    name: name || 'Unknown',
    verdict: isTarget ? 'TARGET' : isFade ? 'FADE' : 'NEUTRAL',
    keyStats: [
      era !== null ? `ERA: ${era.toFixed(2)}` : null,
      whip !== null ? `WHIP: ${whip.toFixed(2)}` : null,
      k9 !== null ? `K/9: ${k9.toFixed(1)}` : null,
    ].filter(Boolean).join('  ·  '),
    edge: isTarget || isFade,
    raw: stats,
  }
}

export function evaluateBullpen(awayStats, homeStats) {
  if (!awayStats?.era || !homeStats?.era) {
    return { edge: 'UNKNOWN', note: 'Bullpen data unavailable', hasEdge: false }
  }
  const diff = Math.abs(awayStats.era - homeStats.era)
  const hasEdge = diff >= STRATEGY.BULLPEN.EDGE_THRESHOLD
  const betterTeam = awayStats.era < homeStats.era ? 'Away' : 'Home'

  return {
    edge: hasEdge ? betterTeam : 'EVEN',
    awayEra: awayStats.era.toFixed(2),
    homeEra: homeStats.era.toFixed(2),
    diff: diff.toFixed(2),
    hasEdge,
    note: hasEdge
      ? `${betterTeam} bullpen ERA ${diff.toFixed(2)} runs better (Away: ${awayStats.era.toFixed(2)}, Home: ${homeStats.era.toFixed(2)})`
      : `Bullpens similar — Away: ${awayStats.era.toFixed(2)}, Home: ${homeStats.era.toFixed(2)}`,
  }
}

export function checkOdds(oddsString) {
  if (!oddsString) return { valid: false, note: 'No odds available' }
  const n = parseInt(oddsString.replace('+', ''))
  if (isNaN(n)) return { valid: false, note: 'Could not parse odds' }
  const isFavorite = n < 0
  const tooHeavy = isFavorite && n < STRATEGY.MAX_ODDS_TO_BET
  return {
    valid: !tooHeavy,
    american: oddsString,
    note: tooHeavy
      ? `${oddsString} is heavier than -150 — skip regardless of other factors`
      : `${oddsString} is within acceptable range`,
  }
}
