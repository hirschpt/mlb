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

function PitcherBox({ pitcher, side }) {
  const color = pitcher.verdict === 'TARGET' ? 'green'
    : pitcher.verdict === 'FADE' ? 'red'
    : pitcher.verdict === 'INSUFFICIENT_DATA' ? 'amber'
    : 'default'

  return (
    <div className={styles.pitcherBox}>
      <div className={styles.pitcherSide}>{side} SP</div>
      <div className={styles.pitcherName}>{pitcher.name}</div>
      <Pill color={color}>{pitcher.verdict}</Pill>
      <div className={styles.pitcherStats}>{pitcher.keyStats}</div>
      {pitcher.recentForm && (
        <div className={styles.pitcherRecent}>{pitcher.recentForm}</div>
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
          <PitcherBox pitcher={game.pitcherAnalysis.away} side="Away" />
          <div className={styles.pitcherDivider} />
          <PitcherBox pitcher={game.pitcherAnalysis.home} side="Home" />
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
