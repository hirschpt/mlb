// pages/api/analyze.js
import Anthropic from '@anthropic-ai/sdk'
import { getTodaysGames, getPitcherSeasonStats, getTeamBullpenStats } from '../../lib/mlbApi'
import { evaluatePitcher, evaluateBullpen } from '../../lib/strategy'
import { getMLBOdds, findOddsForGame, fmtOdds } from '../../lib/oddsApi'
import { fetchSavantLeaderboard, getPitcherGameLog, analyzeLineMovement } from '../../lib/advancedStats'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a disciplined MLB betting analyst. ALL DATA IS REAL — fetched live. Synthesize it. Do not guess.

DATA SOURCES: MLB Stats API (ERA, WHIP, K/9), Baseball Savant (xFIP calculated from real FB data, xERA, HardHit%, Barrel%), MLB game log (last 5 real starts), The Odds API (live odds 8+ books), inter-book line movement analysis.

STRATEGY:
1. PITCHING EDGE: Fade WHIP>1.30 AND K/9<7. Target WHIP<1.20 AND K/9>9. ERA vs xFIP gap of 1.0+ = lucky (fade) or unlucky (target).
2. PRICE: goodPrice=false if best available odds worse than -150. Never recommend a bet at -151 or worse.
3. LINE MOVEMENT: Use the lineMovement.signal in the data. SHARP_AWAY or SHARP_HOME = confirmed signal. NONE = no signal.
4. BULLPEN: Edge if ERA gap >= 1.30 runs.
5. Need 3+ of 4 criteria to recommend BET. Most days = 0-2 bets.

Return ONLY valid JSON, no markdown, no backticks.

Schema:
{
  "games": [{
    "matchup": "Away vs Home",
    "gameTime": "7:05 PM ET",
    "venue": "...",
    "recommendation": "BET" | "NO BET",
    "side": "Team name" | null,
    "confidence": "HIGH" | "MEDIUM" | "LOW" | null,
    "bestBook": "DraftKings" | null,
    "bestOdds": "+125" | null,
    "bestBookUrl": "https://..." | null,
    "oddsNote": "one sentence on odds",
    "criteriaHit": { "pitchingEdge": bool, "goodPrice": bool, "reverseLineMovement": bool, "bullpenEdge": bool },
    "criteriaCount": 0-4,
    "pitcherAnalysis": {
      "away": { "name": "...", "verdict": "TARGET"|"FADE"|"NEUTRAL"|"INSUFFICIENT_DATA", "keyStats": "ERA: X · WHIP: X · K/9: X · xFIP: X · xERA: X", "eraVsXfip": "ERA X vs xFIP X — lucky/unlucky/aligned", "recentForm": "Last N starts: ERA X, K/9 X, QS N/N — TREND", "recentStarts": "5IP 2ER 7K vs NYY, ..." },
      "home": { "name": "...", "verdict": "TARGET"|"FADE"|"NEUTRAL"|"INSUFFICIENT_DATA", "keyStats": "...", "eraVsXfip": "...", "recentForm": "...", "recentStarts": "..." }
    },
    "bullpenEdge": "Away"|"Home"|"Even"|"Unknown",
    "bullpenNote": "...",
    "lineMovementNote": "Describe the real signal from the data provided",
    "situationalAngles": ["..."],
    "reasoning": "2-3 sentences grounded only in the real data",
    "redFlags": ["..."]
  }],
  "analysisDate": "...",
  "dataSource": "...",
  "summary": "1-2 sentences"
}`

function pitcherBlock(side, pitcher, savant, gameLog) {
  const lines = [`${side} PITCHER: ${pitcher.name}`, `  Season: ${pitcher.keyStats}`]
  if (savant) {
    lines.push(`  xFIP (calculated from Savant FB data): ${savant.xfip ?? 'N/A'}  xERA: ${savant.xera ?? 'N/A'}`)
    lines.push(`  GB%: ${savant.gbPct ?? '—'}  FB%: ${savant.fbPct ?? '—'}  HardHit%: ${savant.hardHitPct ?? '—'}  Barrel%: ${savant.barrelPct ?? '—'}`)
    if (savant.xfip && pitcher.raw?.era) {
      const diff = (savant.xfip - pitcher.raw.era).toFixed(2)
      const sign = diff > 0 ? '+' : ''
      lines.push(`  ERA vs xFIP gap: ${sign}${diff} — ${diff > 1 ? 'ERA looks lucky, expect regression' : diff < -1 ? 'ERA looks unlucky, may outperform' : 'roughly aligned'}`)
    }
  } else {
    lines.push(`  xFIP/xERA: Not in Savant (new pitcher or < minimum IP)`)
  }
  if (gameLog) {
    lines.push(`  Recent ${gameLog.count} starts — ERA: ${gameLog.recentEra ?? '—'}  K/9: ${gameLog.recentK9 ?? '—'}  BB/9: ${gameLog.recentBB9 ?? '—'}  QS: ${gameLog.qualityStarts}/${gameLog.count}  Trend: ${gameLog.trend}`)
    gameLog.starts.forEach(s => {
      lines.push(`    ${s.date} vs ${s.opponent}: ${s.ip}IP  ${s.er}ER  ${s.k}K  ${s.bb}BB  [${s.quality}]`)
    })
  } else {
    lines.push(`  Recent form: No game log (0 starts this season or API unavailable)`)
  }
  lines.push(`  Pre-screen: ${pitcher.verdict}`)
  return lines.join('\n')
}

function buildGameBlock(g, i) {
  const timeStr = new Date(g.gameTime).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  const { awayPitcher, homePitcher, awaySavant, homeSavant, awayGameLog, homeGameLog, bullpen, odds, lineMovement } = g.realData

  let oddsBlock = 'ODDS: Not configured'
  if (odds) {
    const bookLines = odds.books.map(b => `    ${b.bookName}: Away ${fmtOdds(b.awayOdds)} / Home ${fmtOdds(b.homeOdds)}`).join('\n')
    oddsBlock = [
      `ODDS (real — ${odds.bookCount} books via The Odds API):`,
      `  Best Away: ${fmtOdds(odds.bestAway.odds)} @ ${odds.bestAway.book} | URL: ${odds.bestAway.bookUrl}`,
      `  Best Home: ${fmtOdds(odds.bestHome.odds)} @ ${odds.bestHome.book} | URL: ${odds.bestHome.bookUrl}`,
      `  Away passes -150 rule: ${odds.awayPassesFilter} | Home passes: ${odds.homePassesFilter}`,
      `  Consensus: Away ${fmtOdds(odds.consensusAway)} / Home ${fmtOdds(odds.consensusHome)}`,
      `  Book spread: Away ${odds.awaySpread}pts / Home ${odds.homeSpread}pts`,
      bookLines,
    ].join('\n')
  }

  let rlmBlock = 'LINE MOVEMENT: Insufficient data'
  if (lineMovement) {
    rlmBlock = [
      `LINE MOVEMENT (real — inter-book analysis):`,
      `  Signal: ${lineMovement.signal} | Sharp side: ${lineMovement.sharpSide || 'none'}`,
      `  Away vs consensus: ${lineMovement.awayVsConsensus > 0 ? '+' : ''}${lineMovement.awayVsConsensus}pts`,
      `  Home vs consensus: ${lineMovement.homeVsConsensus > 0 ? '+' : ''}${lineMovement.homeVsConsensus}pts`,
      `  Max book spread: ${lineMovement.maxBookSpread}pts`,
      `  Summary: ${lineMovement.summary}`,
    ].join('\n')
  }

  return [
    `GAME ${i + 1}: ${g.away.team} (Away) vs ${g.home.team} (Home)`,
    `Time: ${timeStr} | Venue: ${g.venue}`,
    '',
    pitcherBlock('AWAY', awayPitcher, awaySavant, awayGameLog),
    '',
    pitcherBlock('HOME', homePitcher, homeSavant, homeGameLog),
    '',
    `BULLPEN: Away ERA ${bullpen.awayEra || 'N/A'} / Home ERA ${bullpen.homeEra || 'N/A'} — ${bullpen.note}`,
    '',
    oddsBlock,
    '',
    rlmBlock,
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { date, userNote } = req.body
    const targetDate = date || new Date().toISOString().split('T')[0]
    const season = parseInt(targetDate.slice(0, 4))
    const oddsApiKey = process.env.ODDS_API_KEY || null

    // 1. All top-level fetches in parallel
    let games, oddsMap, savantMap
    try {
      ;[games, oddsMap, savantMap] = await Promise.all([
        getTodaysGames(targetDate),
        oddsApiKey
          ? getMLBOdds(oddsApiKey).catch(e => { console.warn('Odds API:', e.message); return null })
          : Promise.resolve(null),
        fetchSavantLeaderboard(season).catch(e => { console.warn('Savant:', e.message); return new Map() }),
      ])
    } catch (e) {
      return res.status(502).json({ error: `MLB API unavailable: ${e.message}` })
    }

    if (!games.length) {
      return res.status(200).json({
        games: [], analysisDate: targetDate,
        summary: 'No MLB games scheduled for this date.',
        dataSource: 'MLB Stats API',
      })
    }

    // 2. Per-game enrichment — all sources in parallel per game
    const enriched = await Promise.all(games.map(async (game) => {
      const [
        awayPitcherStats, homePitcherStats,
        awayBullpen, homeBullpen,
        awayGameLog, homeGameLog,
      ] = await Promise.all([
        game.away.pitcher?.id ? getPitcherSeasonStats(game.away.pitcher.id) : null,
        game.home.pitcher?.id ? getPitcherSeasonStats(game.home.pitcher.id) : null,
        getTeamBullpenStats(game.away.teamId),
        getTeamBullpenStats(game.home.teamId),
        game.away.pitcher?.id ? getPitcherGameLog(game.away.pitcher.id, season) : null,
        game.home.pitcher?.id ? getPitcherGameLog(game.home.pitcher.id, season) : null,
      ])

      const awayPitcher = evaluatePitcher(awayPitcherStats, game.away.pitcher?.name)
      const homePitcher = evaluatePitcher(homePitcherStats, game.home.pitcher?.name)
      const bullpen = evaluateBullpen(awayBullpen, homeBullpen)
      const awaySavant = game.away.pitcher?.id ? (savantMap.get(String(game.away.pitcher.id)) || null) : null
      const homeSavant = game.home.pitcher?.id ? (savantMap.get(String(game.home.pitcher.id)) || null) : null
      const odds = oddsMap ? findOddsForGame(oddsMap, game.away.team, game.home.team) : null
      const lineMovement = odds ? analyzeLineMovement(odds) : null

      return { ...game, realData: { awayPitcher, homePitcher, awaySavant, homeSavant, awayGameLog, homeGameLog, bullpen, odds, lineMovement } }
    }))

    // 3. Build Claude prompt
    const gamesSummary = enriched.map((g, i) => buildGameBlock(g, i)).join('\n\n---\n\n')
    const userMessage = [
      `Date: ${targetDate}`,
      userNote ? `Context: ${userNote}` : null,
      `Savant data: ${savantMap.size} pitchers loaded`,
      `Odds: ${oddsMap ? 'available' : 'not configured'}`,
      '',
      gamesSummary,
      '',
      'Apply strategy strictly. Return JSON only.',
    ].filter(Boolean).join('\n')

    // 4. Claude analysis
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content.map(b => b.text || '').join('')

    // Robust JSON extraction: strip markdown fences, then find the outermost {...} block
    let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const jsonStart = clean.indexOf('{')
    const jsonEnd = clean.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      clean = clean.slice(jsonStart, jsonEnd + 1)
    }

    let analysis
    try {
      analysis = JSON.parse(clean)
    } catch {
      console.error('Raw Claude response:', text.slice(0, 1000))
      return res.status(500).json({ error: 'Failed to parse Claude response', raw: clean.slice(0, 500) })
    }

    // 5. Attach raw real data to each game for UI rendering
    analysis.games = analysis.games.map(game => {
      const eg = enriched.find(g =>
        game.matchup?.includes(g.away.team) || game.matchup?.includes(g.home.team)
      )
      return {
        ...game,
        oddsBreakdown: eg?.realData?.odds || null,
        lineMovementData: eg?.realData?.lineMovement || null,
        awayGameLog: eg?.realData?.awayGameLog || null,
        homeGameLog: eg?.realData?.homeGameLog || null,
        awaySavant: eg?.realData?.awaySavant || null,
        homeSavant: eg?.realData?.homeSavant || null,
      }
    })

    analysis.oddsAvailable = !!oddsMap
    analysis.savantAvailable = savantMap.size > 0
    analysis.analysisDate = targetDate
    analysis.dataSource = ['MLB Stats API', savantMap.size > 0 ? 'Baseball Savant (xFIP/xERA)' : null, oddsMap ? 'The Odds API' : null].filter(Boolean).join(' · ')

    return res.status(200).json(analysis)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
