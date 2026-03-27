// pages/api/analyze.js
import Anthropic from '@anthropic-ai/sdk'
import {
  getTodaysGames,
  getPitcherSeasonStats,
  getTeamBullpenStats,
} from '../../lib/mlbApi'
import { evaluatePitcher, evaluateBullpen } from '../../lib/strategy'
import { getMLBOdds, findOddsForGame, fmtOdds } from '../../lib/oddsApi'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a disciplined MLB betting analyst following a strict "Beat the Book" strategy.

You will receive REAL data already fetched from the MLB Stats API: today's games, pitcher season stats (ERA, WHIP, K/9), and bullpen ERAs. Your job is to complete the analysis using this real data plus your knowledge of:
- xFIP estimates (since the free MLB API doesn't expose this)
- Pitcher recent form (last 3-5 starts)  
- Line movement and public betting tendencies
- Situational angles (travel, day-after-night, fatigue)

STRICT STRATEGY RULES:
1. PITCHING EDGE: Fade pitchers with WHIP > 1.30 AND K/9 < 7. Target pitchers with WHIP < 1.20 AND K/9 > 9.
2. NEVER recommend betting worse than -150 odds. If price is worse, mark goodPrice: false and this alone can kill the bet.
3. REVERSE LINE MOVEMENT: If 65%+ of public bets are on one side but the line drifts toward the other, that's a sharp signal.
4. BULLPEN EDGE: If one team's bullpen ERA is 1.3+ better, that's a real edge.
5. FINAL FILTER: Recommend BET only if 3+ of 4 criteria are met.

ODDS DATA: You will receive REAL live odds from The Odds API for each game — best available price per side, which book offers it, and consensus line. Use this to:
- Set goodPrice = true/false based on the REAL best available odds (not worse than -150)
- Identify which side looks like value vs the consensus
- Flag if one book is significantly off consensus (arbitrage/value signal)
- Note if the best price is at a sharp book (Pinnacle, Circa) vs soft book

HONESTY RULES:
- If early season with < 3 starts, note the small sample and be more conservative
- If you're uncertain about recent form, say so
- Most days = 0-2 bets. Never force action.
- For line movement: describe tendencies, do not invent specific % numbers unless provided in the data

Return ONLY valid JSON, no markdown, no backticks, no explanation outside the JSON.

Schema:
{
  "games": [
    {
      "matchup": "Away Team vs Home Team",
      "gameTime": "7:05 PM ET",
      "venue": "...",
      "recommendation": "BET" | "NO BET",
      "side": "Away Team name" | "Home Team name" | null,
      "confidence": "HIGH" | "MEDIUM" | "LOW" | null,
      "bestBook": "DraftKings" | null,
      "bestOdds": "+125" | null,
      "bestBookUrl": "https://..." | null,
      "oddsNote": "One sentence on the odds landscape — e.g. 'FanDuel offers best price at +130, market consensus is +118'",
      "criteriaHit": {
        "pitchingEdge": true | false,
        "goodPrice": true | false,
        "reverseLineMovement": true | false,
        "bullpenEdge": true | false
      },
      "criteriaCount": 0-4,
      "pitcherAnalysis": {
        "away": {
          "name": "...",
          "verdict": "TARGET" | "FADE" | "NEUTRAL" | "INSUFFICIENT_DATA",
          "keyStats": "ERA: X  ·  WHIP: X  ·  K/9: X  ·  xFIP: ~X",
          "recentForm": "Brief note on last 3-5 starts"
        },
        "home": {
          "name": "...",
          "verdict": "TARGET" | "FADE" | "NEUTRAL" | "INSUFFICIENT_DATA",
          "keyStats": "ERA: X  ·  WHIP: X  ·  K/9: X  ·  xFIP: ~X",
          "recentForm": "Brief note on last 3-5 starts"
        }
      },
      "bullpenEdge": "Away" | "Home" | "Even" | "Unknown",
      "bullpenNote": "...",
      "lineMovementNote": "...",
      "situationalAngles": ["..."],
      "reasoning": "2-3 sentences explaining the recommendation honestly",
      "redFlags": ["..."]
    }
  ],
  "analysisDate": "...",
  "dataSource": "MLB Stats API + The Odds API (real) + Claude analysis",
  "summary": "1-2 sentence overview of today's slate"
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { date, userNote } = req.body
    const targetDate = date || new Date().toISOString().split('T')[0]
    const oddsApiKey = process.env.ODDS_API_KEY || null

    // 1. Fetch today's games + real odds in parallel
    let games, oddsMap
    try {
      ;[games, oddsMap] = await Promise.all([
        getTodaysGames(targetDate),
        oddsApiKey ? getMLBOdds(oddsApiKey).catch(e => {
          console.warn('Odds API failed:', e.message)
          return null
        }) : Promise.resolve(null),
      ])
    } catch (e) {
      return res.status(502).json({ error: `MLB API unavailable: ${e.message}` })
    }

    if (!games.length) {
      return res.status(200).json({
        games: [],
        analysisDate: targetDate,
        summary: 'No MLB games scheduled for this date.',
        dataSource: 'MLB Stats API',
      })
    }

    // 2. Fetch pitcher + bullpen stats, attach odds
    const enriched = await Promise.all(
      games.map(async (game) => {
        const [awayPitcherStats, homePitcherStats, awayBullpen, homeBullpen] =
          await Promise.all([
            game.away.pitcher?.id ? getPitcherSeasonStats(game.away.pitcher.id) : null,
            game.home.pitcher?.id ? getPitcherSeasonStats(game.home.pitcher.id) : null,
            getTeamBullpenStats(game.away.teamId),
            getTeamBullpenStats(game.home.teamId),
          ])

        const awayPitcher = evaluatePitcher(awayPitcherStats, game.away.pitcher?.name)
        const homePitcher = evaluatePitcher(homePitcherStats, game.home.pitcher?.name)
        const bullpen = evaluateBullpen(awayBullpen, homeBullpen)

        // Match odds to this game
        const odds = oddsMap
          ? findOddsForGame(oddsMap, game.away.team, game.home.team)
          : null

        return { ...game, realData: { awayPitcher, homePitcher, bullpen, odds } }
      })
    )

    // 3. Build prompt
    const gamesSummary = enriched.map((g, i) => {
      const timeStr = new Date(g.gameTime).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
      }) + ' ET'

      const odds = g.realData.odds
      let oddsSection = 'ODDS: Not available (no Odds API key configured)'
      if (odds) {
        const bookLines = odds.books
          .map(b => `  ${b.bookName}: Away ${fmtOdds(b.awayOdds)} / Home ${fmtOdds(b.homeOdds)}`)
          .join('\n')
        oddsSection = `ODDS (REAL - from The Odds API):
  Best Away: ${fmtOdds(odds.bestAway.odds)} @ ${odds.bestAway.book} ${odds.awayPassesFilter ? '✓' : '✗ OVER -150 LIMIT'}
  Best Home: ${fmtOdds(odds.bestHome.odds)} @ ${odds.bestHome.book} ${odds.homePassesFilter ? '✓' : '✗ OVER -150 LIMIT'}
  Consensus Away: ${fmtOdds(odds.consensusAway)} | Consensus Home: ${fmtOdds(odds.consensusHome)}
  Line spread (Away): ${odds.awaySpread} pts | Line spread (Home): ${odds.homeSpread} pts
  Books reporting: ${odds.bookCount}
All book lines:
${bookLines}
  Best away book URL: ${odds.bestAway.bookUrl}
  Best home book URL: ${odds.bestHome.bookUrl}`
      }

      return `
GAME ${i + 1}: ${g.away.team} (Away) vs ${g.home.team} (Home)
Time: ${timeStr} | Venue: ${g.venue}

AWAY PITCHER: ${g.realData.awayPitcher.name}
  Stats: ${g.realData.awayPitcher.keyStats}
  Verdict: ${g.realData.awayPitcher.verdict}

HOME PITCHER: ${g.realData.homePitcher.name}
  Stats: ${g.realData.homePitcher.keyStats}
  Verdict: ${g.realData.homePitcher.verdict}

BULLPEN:
  Away ERA: ${g.realData.bullpen.awayEra || 'N/A'} | Home ERA: ${g.realData.bullpen.homeEra || 'N/A'}
  Note: ${g.realData.bullpen.note}

${oddsSection}`
    }).join('\n---\n')

    const userMessage = `Today's date: ${targetDate}
${userNote ? `User context: ${userNote}\n` : ''}
${oddsMap ? 'Odds data IS available from The Odds API — use bestBook, bestOdds, bestBookUrl fields.' : 'Odds data NOT available — omit bestBook/bestOdds/bestBookUrl fields.'}

${gamesSummary}

Apply the Beat the Book strategy strictly. Return JSON only.`

    // 4. Claude analysis
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content.map(b => b.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()

    let analysis
    try {
      analysis = JSON.parse(clean)
    } catch {
      return res.status(500).json({ error: 'Failed to parse Claude response', raw: clean })
    }

    // 5. Attach full odds breakdown to each game for the UI
    analysis.games = analysis.games.map(game => {
      const enrichedGame = enriched.find(g =>
        game.matchup?.includes(g.away.team) || game.matchup?.includes(g.home.team)
      )
      return {
        ...game,
        oddsBreakdown: enrichedGame?.realData?.odds || null,
      }
    })

    analysis.oddsAvailable = !!oddsMap
    analysis.realDataSnapshot = enriched.map(g => ({
      matchup: `${g.away.team} vs ${g.home.team}`,
      awayPitcher: g.realData.awayPitcher,
      homePitcher: g.realData.homePitcher,
      bullpen: g.realData.bullpen,
    }))

    return res.status(200).json(analysis)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
