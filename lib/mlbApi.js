// lib/mlbApi.js
// Official MLB Stats API - free, no key required
const MLB_API = 'https://statsapi.mlb.com/api/v1'

export async function getTodaysGames(date) {
  const dateStr = date || new Date().toISOString().split('T')[0]

  const scheduleUrl = `${MLB_API}/schedule?sportId=1&date=${dateStr}&hydrate=probablePitcher(note),team,linescore,broadcasts`
  const res = await fetch(scheduleUrl, { next: { revalidate: 900 } }) // cache 15 min
  if (!res.ok) throw new Error(`MLB API error: ${res.status}`)
  const data = await res.json()

  const dates = data.dates || []
  if (!dates.length) return []

  return dates[0].games.map(game => ({
    gameId: game.gamePk,
    gameTime: game.gameDate,
    status: game.status?.detailedState || 'Scheduled',
    venue: game.venue?.name || '',
    away: {
      team: game.teams.away.team.name,
      teamAbbr: game.teams.away.team.abbreviation,
      teamId: game.teams.away.team.id,
      pitcher: game.teams.away.probablePitcher
        ? {
            id: game.teams.away.probablePitcher.id,
            name: game.teams.away.probablePitcher.fullName,
          }
        : null,
    },
    home: {
      team: game.teams.home.team.name,
      teamAbbr: game.teams.home.team.abbreviation,
      teamId: game.teams.home.team.id,
      pitcher: game.teams.home.probablePitcher
        ? {
            id: game.teams.home.probablePitcher.id,
            name: game.teams.home.probablePitcher.fullName,
          }
        : null,
    },
  }))
}

export async function getPitcherSeasonStats(playerId, season) {
  if (!playerId) return null
  const yr = season || new Date().getFullYear()

  async function fetchSeason(year) {
    const url = `${MLB_API}/people/${playerId}/stats?stats=season&group=pitching&season=${year}`
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } })
      if (!res.ok) return null
      const data = await res.json()
      const splits = data.stats?.[0]?.splits
      if (!splits || !splits.length) return null
      const s = splits[0].stat
      return {
        era: parseFloat(s.era) || null,
        whip: parseFloat(s.whip) || null,
        strikeOuts: s.strikeOuts || 0,
        inningsPitched: parseFloat(s.inningsPitched) || 0,
        walks: s.baseOnBalls || 0,
        hits: s.hits || 0,
        games: s.gamesPitched || 0,
        wins: s.wins || 0,
        losses: s.losses || 0,
        k9: s.inningsPitched > 0
          ? parseFloat(((s.strikeOuts / parseFloat(s.inningsPitched)) * 9).toFixed(2))
          : null,
        season: year,
      }
    } catch {
      return null
    }
  }

  const current = await fetchSeason(yr)
  // If current season has meaningful data (3+ games), use it
  if (current && current.games >= 3) return current
  // Otherwise fall back to prior season (common early in season or for new pitchers)
  const prior = await fetchSeason(yr - 1)
  return current || prior  // return whatever we have, prefer current even if small sample
}

export async function getTeamBullpenStats(teamId, season) {
  if (!teamId) return null
  const yr = season || new Date().getFullYear()
  // Team pitching stats split by relief
  const url = `${MLB_API}/teams/${teamId}/stats?stats=season&group=pitching&season=${yr}&sportId=1`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = await res.json()
    const splits = data.stats?.[0]?.splits
    if (!splits || !splits.length) return null
    const s = splits[0].stat
    return {
      era: parseFloat(s.era) || null,
      whip: parseFloat(s.whip) || null,
      saves: s.saves || 0,
      blownSaves: s.blownSaves || 0,
    }
  } catch {
    return null
  }
}
