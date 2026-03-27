// pages/index.js
import { useState } from 'react'
import Head from 'next/head'
import GameCard from '../components/GameCard'
import styles from '../styles/Home.module.css'

function StatCard({ value, label }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

export default function Home() {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [elapsed, setElapsed] = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setHasRun(true)
    setAnalysis(null)
    const t0 = Date.now()

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userNote: note, date: date || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis(data)
      setElapsed(((Date.now() - t0) / 1000).toFixed(1))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const bets = analysis?.games?.filter(g => g.recommendation === 'BET') || []
  const noBets = analysis?.games?.filter(g => g.recommendation !== 'BET') || []
  const total = analysis?.games?.length || 0

  return (
    <>
      <Head>
        <title>MLB Beat the Book</title>
        <meta name="description" content="MLB betting analyzer — pitching edges, sharp money, bullpen gaps" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚾</text></svg>" />
      </Head>

      <div className={styles.layout}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>⚾</span>
            <div>
              <div className={styles.logoTitle}>Beat the Book</div>
              <div className={styles.logoSub}>MLB Bet Analyzer</div>
            </div>
          </div>

          <div className={styles.ruleBox}>
            <div className={styles.ruleTitle}>Strategy Rules</div>
            <div className={styles.rule}>
              <span className={styles.ruleNum}>01</span>
              Pitching edge via WHIP + K/9
            </div>
            <div className={styles.rule}>
              <span className={styles.ruleNum}>02</span>
              Price no worse than −150
            </div>
            <div className={styles.rule}>
              <span className={styles.ruleNum}>03</span>
              Sharp money / reverse line move
            </div>
            <div className={styles.rule}>
              <span className={styles.ruleNum}>04</span>
              Bullpen ERA gap ≥ 1.30
            </div>
            <div className={styles.ruleFooter}>Need 3 of 4 to bet</div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Date (optional)</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={styles.dateInput}
              placeholder="Today"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Context (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Wind blowing out at Wrigley · Phillies on 2nd game of road trip"
              rows={3}
            />
          </div>

          <button
            className={styles.runBtn}
            onClick={run}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loadingDots}>
                Fetching MLB data<span className={styles.dots}>...</span>
              </span>
            ) : hasRun ? 'Re-run analysis' : 'Run analysis'}
          </button>

          <div className={styles.dataNote}>
            Real data: MLB Stats API (free)<br />
            Live odds: The Odds API{analysis?.oddsAvailable === false ? ' — not configured' : analysis?.oddsAvailable ? ' ✓ connected' : ''}<br />
            Advanced stats: Claude AI
          </div>
        </aside>

        {/* Main */}
        <main className={styles.main}>
          {!hasRun && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>⚾</div>
              <div className={styles.emptyTitle}>Ready to analyze</div>
              <div className={styles.emptyText}>
                Pulls today's probable pitchers and team stats from the official MLB API,
                then applies the Beat the Book strategy. Says NO BET when criteria aren't met.
              </div>
            </div>
          )}

          {loading && (
            <div className={styles.loading}>
              <div className={styles.loadingStep}>① Fetching today's schedule from MLB API...</div>
              <div className={styles.loadingStep}>② Pulling live odds from DraftKings, FanDuel, BetMGM, Caesars...</div>
              <div className={styles.loadingStep}>③ Pulling pitcher stats (ERA, WHIP, K/9) + bullpen ERAs...</div>
              <div className={styles.loadingStep}>④ Running Beat the Book strategy analysis...</div>
            </div>
          )}

          {error && (
            <div className={styles.errorBox}>
              <div className={styles.errorTitle}>Error</div>
              <div>{error}</div>
            </div>
          )}

          {analysis && !loading && (
            <>
              <div className={styles.statsRow}>
                <StatCard value={bets.length} label="bets today" />
                <StatCard value={noBets.length} label="skipped" />
                <StatCard value={total} label="games analyzed" />
                {elapsed && <StatCard value={`${elapsed}s`} label="analysis time" />}
              </div>

              {analysis.summary && (
                <div className={styles.summary}>{analysis.summary}</div>
              )}

              {bets.length > 0 && (
                <>
                  <div className={styles.sectionLabel}>Today's plays</div>
                  {bets.map((game, i) => <GameCard key={i} game={game} />)}
                </>
              )}

              {bets.length === 0 && (
                <div className={styles.noBetsBanner}>
                  No plays today — criteria not met across the slate. Stay disciplined.
                </div>
              )}

              {noBets.length > 0 && (
                <>
                  <div className={styles.sectionLabel} style={{ marginTop: 24 }}>No bet</div>
                  {noBets.map((game, i) => <GameCard key={i} game={game} />)}
                </>
              )}

              <div className={styles.footer}>
                Data: {analysis.dataSource} · {analysis.analysisDate}
                <br />
                Flat bet 1–2% of bankroll per play. Never chase losses.
              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}
