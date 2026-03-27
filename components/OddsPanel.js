// components/OddsPanel.js
import { useState } from 'react'
import styles from './OddsPanel.module.css'

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

function impliedPct(american) {
  if (!american) return null
  const pct = american > 0
    ? (100 / (american + 100)) * 100
    : (Math.abs(american) / (Math.abs(american) + 100)) * 100
  return pct.toFixed(1)
}

function oddsClass(odds, isUnderdogSide) {
  if (!odds) return ''
  if (odds >= -150 && odds <= 150) return styles.good   // within strategy range
  if (odds < -150) return styles.bad                    // too heavy to bet
  return styles.good
}

export default function OddsPanel({ odds, side, awayTeam, homeTeam }) {
  const [expanded, setExpanded] = useState(false)
  if (!odds) return null

  const { books, bestAway, bestHome, consensusAway, consensusHome,
          awaySpread, homeSpread, bookCount } = odds

  const betSide = side  // which team we're betting

  // Sort: best price for our side first
  const sorted = [...books].sort((a, b) => {
    const aPrice = betSide === awayTeam ? a.awayOdds : a.homeOdds
    const bPrice = betSide === awayTeam ? b.awayOdds : b.homeOdds
    return bPrice - aPrice
  })

  const isBettingAway = betSide === awayTeam || !betSide

  return (
    <div className={styles.panel}>
      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryLeft}>
          <span className={styles.summaryLabel}>Odds across {bookCount} books</span>
          {betSide && (
            <span className={styles.bettingSide}>Betting: {betSide}</span>
          )}
        </div>
        <button
          className={styles.toggleBtn}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? 'Hide breakdown ↑' : 'Show all books ↓'}
        </button>
      </div>

      {/* Best price callout */}
      <div className={styles.bestRow}>
        <BestPriceCard
          label={`Best ${awayTeam}`}
          odds={bestAway.odds}
          book={bestAway.book}
          url={bestAway.bookUrl}
          isTarget={betSide === awayTeam}
          passes={odds.awayPassesFilter}
        />
        <div className={styles.vsDiv}>
          <div className={styles.vsLabel}>consensus</div>
          <div className={styles.vsAway}>{fmt(consensusAway)}</div>
          <div className={styles.vsSep}>·</div>
          <div className={styles.vsHome}>{fmt(consensusHome)}</div>
        </div>
        <BestPriceCard
          label={`Best ${homeTeam}`}
          odds={bestHome.odds}
          book={bestHome.book}
          url={bestHome.bookUrl}
          isTarget={betSide === homeTeam}
          passes={odds.homePassesFilter}
          alignRight
        />
      </div>

      {/* Full book table */}
      {expanded && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Sportsbook</th>
                <th className={styles.right}>{awayTeam}</th>
                <th className={styles.right}>{homeTeam}</th>
                <th className={styles.right}>Away prob</th>
                <th className={styles.right}>Home prob</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((book, i) => {
                const isBestAway = book.bookKey === bestAway.bookKey
                const isBestHome = book.bookKey === bestHome.bookKey
                const targetOdds = betSide === awayTeam ? book.awayOdds : book.homeOdds
                const isTargetBest = betSide === awayTeam ? isBestAway : isBestHome
                const passesFilter = targetOdds >= -150

                return (
                  <tr key={book.bookKey} className={isTargetBest ? styles.bestRow_tr : ''}>
                    <td className={styles.bookName}>
                      {isTargetBest && betSide && <span className={styles.star}>★ </span>}
                      {book.bookName}
                    </td>
                    <td className={`${styles.right} ${isBestAway ? styles.bestCell : ''}`}>
                      <span className={book.awayOdds < -150 ? styles.bad : styles.good}>
                        {fmt(book.awayOdds)}
                      </span>
                    </td>
                    <td className={`${styles.right} ${isBestHome ? styles.bestCell : ''}`}>
                      <span className={book.homeOdds < -150 ? styles.bad : styles.good}>
                        {fmt(book.homeOdds)}
                      </span>
                    </td>
                    <td className={`${styles.right} ${styles.prob}`}>{impliedPct(book.awayOdds)}%</td>
                    <td className={`${styles.right} ${styles.prob}`}>{impliedPct(book.homeOdds)}%</td>
                    <td className={styles.right}>
                      {book.bookUrl && (
                        <a
                          href={book.bookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${styles.betLink} ${isTargetBest && passesFilter ? styles.betLinkPrimary : ''}`}
                        >
                          Bet →
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className={styles.tableNote}>
            ★ = best price for recommended side · Green = within −150 strategy limit
          </div>
        </div>
      )}
    </div>
  )
}

function BestPriceCard({ label, odds, book, url, isTarget, passes, alignRight }) {
  return (
    <div className={`${styles.bestCard} ${isTarget ? styles.bestCard_target : ''} ${alignRight ? styles.alignRight : ''}`}>
      <div className={styles.bestCardLabel}>{label}</div>
      <div className={`${styles.bestCardOdds} ${!passes ? styles.bad : odds > 0 ? styles.dog : styles.fav}`}>
        {fmt(odds)}
      </div>
      <div className={styles.bestCardBook}>@ {book}</div>
      {!passes && <div className={styles.overLimit}>Over −150 limit</div>}
      {url && passes && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.betLink} ${isTarget ? styles.betLinkPrimary : ''}`}
        >
          Bet here →
        </a>
      )}
    </div>
  )
}
