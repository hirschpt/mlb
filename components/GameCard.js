// components/GameCard.js
import styles from './GameCard.module.css'
import OddsPanel from './OddsPanel'

function Pill({ children, color = 'default' }) {
  return <span className={`${styles.pill} ${styles[`pill_${color}`]}`}>{children}</span>
}

function CriteriaRow({ criteria }) {
  const items = [
    { key: 'pitchingEdge', label: 'Pitching edge' },
    { key: 'goodPrice', label: 'Good price' },
    { key: 'reverseLineMovement', label: 'Sharp money' },
    { key: 'bullpenEdge', label: 'Bullpen edge' },
  ]
  return (
    <div className={styles.criteriaRow}>
      {items.map(({ key, label }) => (
        <div key={key} className={`${styles.criterion} ${criteria?.[key] ? styles.criterion_met : styles.criterion_miss}`}>
          <span className={styles.dot}>{criteria?.[key] ? '●' : '○'}</span>
          {label}
        </div>
      ))}
    </div>
  )
}

function PitcherBox({ pitcher, side, savant, gameLog }) {
  const color = pitcher.verdict === 'TARGET' ? 'green'
    : pitcher.verdict === 'FADE' ? 'red'
    : pitcher.verdict === 'INSUFFICIENT_DATA' ? 'amber'
    : 'default'

  const xfipGap = savant?.xfip && pitcher.raw?.era
    ? parseFloat((savant.xfip - pitcher.raw.era).toFixed(2))
    : null
  const gapColor = xfipGap === null ? null
    : xfipGap > 1 ? 'var(--amber)'
    : xfipGap < -1 ? 'var(--green)'
    : 'var(--muted)'
  const gapLabel = xfipGap === null ? null
    : xfipGap > 1 ? 'likely lucky'
    : xfipGap < -1 ? 'likely unlucky'
    : 'aligned'

  return (
    <div className={styles.pitcherBox}>
      <div className={styles.pitcherSide}>{side} SP</div>
      <div className={styles.pitcherName}>{pitcher.name}</div>
      <Pill color={color}>{pitcher.verdict}</Pill>

      {/* Season stats */}
      <div className={styles.pitcherStats}>{pitcher.keyStats}</div>

      {/* Real xFIP + xERA from Baseball Savant */}
      {savant ? (
        <>
          <div className={styles.pitcherStats} style={{ marginTop: 4 }}>
            <span style={{ color: 'var(--dim)' }}>xFIP: </span>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{savant.xfip ?? '—'}</span>
            <span style={{ color: 'var(--dim)', margin: '0 6px' }}>·</span>
            <span style={{ color: 'var(--dim)' }}>xERA: </span>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{savant.xera ?? '—'}</span>
            {xfipGap !== null && (
              <span style={{ color: gapColor, marginLeft: 8, fontSize: 10 }}>
                ({xfipGap > 0 ? '+' : ''}{xfipGap} vs ERA — {gapLabel})
              </span>
            )}
          </div>
          <div className={styles.pitcherStats} style={{ marginTop: 2 }}>
            <span style={{ color: 'var(--dim)' }}>GB%: </span>{savant.gbPct ?? '—'}
            <span style={{ color: 'var(--dim)', margin: '0 4px' }}>·</span>
            <span style={{ color: 'var(--dim)' }}>HardHit%: </span>{savant.hardHitPct ?? '—'}
            <span style={{ color: 'var(--dim)', margin: '0 4px' }}>·</span>
            <span style={{ color: 'var(--dim)' }}>Barrel%: </span>{savant.barrelPct ?? '—'}
          </div>
        </>
      ) : (
        <div className={styles.pitcherStats} style={{ marginTop: 4, color: 'var(--dim)', fontStyle: 'italic' }}>
          xFIP/xERA: not in Savant yet (early season)
        </div>
      )}

      {/* Real game log — last 5 starts */}
      {gameLog && gameLog.count > 0 ? (
        <div style={{ marginTop: 8, borderTop: '0.5px solid var(--border)', paddingTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={styles.pitcherSide}>
              L{gameLog.count}: ERA {gameLog.recentEra ?? '—'} · K/9 {gameLog.recentK9 ?? '—'} · QS {gameLog.qualityStarts}/{gameLog.count}
            </span>
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: gameLog.trend === 'IMPROVING' ? 'var(--green-bg)' : gameLog.trend === 'DECLINING' ? 'var(--red-bg)' : 'transparent',
              color: gameLog.trend === 'IMPROVING' ? 'var(--green)' : gameLog.trend === 'DECLINING' ? 'var(--red)' : 'var(--dim)',
              border: `0.5px solid ${gameLog.trend === 'IMPROVING' ? 'var(--green-border)' : gameLog.trend === 'DECLINING' ? 'var(--red-border)' : 'transparent'}`,
            }}>{gameLog.trend}</span>
          </div>
          {gameLog.starts.map((s, i) => (
            <div key={i} style={{
              display: 'flex', gap: 5, fontSize: 10, color: 'var(--muted)',
              padding: '3px 0', borderBottom: '0.5px solid var(--border)',
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--dim)', width: 68, flexShrink: 0 }}>{s.date}</span>
              <span style={{ color: 'var(--dim)', width: 30, flexShrink: 0, fontSize: 9 }}>@{s.opponent}</span>
              <span style={{ width: 30, flexShrink: 0 }}>{s.ip}ip</span>
              <span style={{ color: s.er === 0 ? 'var(--green)' : s.er >= 5 ? 'var(--red)' : 'var(--muted)', width: 22, flexShrink: 0 }}>{s.er}er</span>
              <span style={{ width: 22, flexShrink: 0 }}>{s.k}k</span>
              <span style={{ width: 22, flexShrink: 0 }}>{s.bb}bb</span>
              <span style={{
                marginLeft: 'auto', fontSize: 9, padding: '1px 5px', borderRadius: 3,
                background: s.quality === 'QS' ? 'var(--green-bg)' : s.quality === 'SHORT' ? 'var(--red-bg)' : 'transparent',
                color: s.quality === 'QS' ? 'var(--green)' : s.quality === 'SHORT' ? 'var(--red)' : 'var(--dim)',
              }}>{s.quality}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.pitcherStats} style={{ marginTop: 4, color: 'var(--dim)', fontStyle: 'italic' }}>
          No starts this season yet
        </div>
      )}
    </div>
  )
}

export default function GameCard({ game }) {
  const isBet = game.recommendation === 'BET'
  const count = game.criteriaCount || 0
  const awayTeam = game.oddsBreakdown?.awayTeam || game.matchup?.split(' vs ')?.[0]
  const homeTeam = game.oddsBreakdown?.homeTeam || game.matchup?.split(' vs ')?.[1]

  const timeStr = (() => {
    try {
      return new Date(game._rawGameTime || game.gameTime).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
      }) + ' ET'
    } catch {
      return game.gameTime || ''
    }
  })()

  return (
    <div className={`${styles.card} ${isBet ? styles.card_bet : styles.card_nobet}`}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.matchup}>{game.matchup}</div>
          <div className={styles.meta}>{timeStr}{game.venue ? ` · ${game.venue}` : ''}</div>
        </div>
        <div className={styles.headerRight}>
          <div className={`${styles.verdict} ${isBet ? styles.verdict_bet : styles.verdict_nobet}`}>
            {isBet ? '✓ BET' : '✗ NO BET'}
          </div>
          {isBet && game.confidence && (
            <div className={styles.confidence}>{game.confidence}</div>
          )}
        </div>
      </div>

      {/* Bet info bar */}
      {isBet && game.side && (
        <div className={styles.betBar}>
          <div>
            <span className={styles.betBarLabel}>Play: </span>
            <span className={styles.betBarSide}>{game.side}</span>
            {game.suggestedOdds && (
              <span className={styles.betBarOdds}> {game.suggestedOdds}</span>
            )}
          </div>
          <div className={styles.betBarCount}>{count}/4 criteria</div>
        </div>
      )}

      {/* Pitchers */}
      {game.pitcherAnalysis && (
        <div className={styles.pitchers}>
          <PitcherBox pitcher={game.pitcherAnalysis.away} side="Away" savant={game.awaySavant} gameLog={game.awayGameLog} />
          <div className={styles.pitcherDivider} />
          <PitcherBox pitcher={game.pitcherAnalysis.home} side="Home" savant={game.homeSavant} gameLog={game.homeGameLog} />
        </div>
      )}

      {/* Criteria badges */}
      <CriteriaRow criteria={game.criteriaHit} />

      {/* Live odds breakdown */}
      <OddsPanel
        odds={game.oddsBreakdown}
        side={isBet ? game.side : null}
        awayTeam={awayTeam}
        homeTeam={homeTeam}
      />

      {/* Odds note from Claude */}
      {game.oddsNote && (
        <div className={styles.oddsNote}>{game.oddsNote}</div>
      )}

      {/* Details */}
      <div className={styles.details}>
        {game.bullpenNote && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Bullpen</span>
            <span>{game.bullpenNote}</span>
          </div>
        )}
        {game.lineMovementNote && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Lines</span>
            <span>{game.lineMovementNote}</span>
          </div>
        )}
        {game.situationalAngles?.length > 0 && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Angles</span>
            <span>{game.situationalAngles.join(' · ')}</span>
          </div>
        )}
      </div>

      {/* Reasoning */}
      <div className={styles.reasoning}>{game.reasoning}</div>

      {/* Red flags */}
      {game.redFlags?.length > 0 && (
        <div className={styles.redFlags}>
          {game.redFlags.map((f, i) => (
            <div key={i} className={styles.redFlag}>⚠ {f}</div>
          ))}
        </div>
      )}
    </div>
  )
}
