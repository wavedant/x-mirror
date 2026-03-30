import { useState } from 'react'
import './App.css'

const STEP_LINK =
  'https://x.com/i/account_analytics/content?type=posts&sort=impressions&dir=desc&from=2025-03-01&to=2026-03-30'

const ALGO_WEIGHTS = {
  like: 1,
  reply: 13.5,
  repost: 20,
  bookmark: 8,
  profileVisit: 12,
  detailExpand: 3,
  share: 9,
  follow: 25,
}

const CATEGORY_RULES = [
  {
    name: 'culture + city',
    keywords: ['bangalore', 'bengaluru', 'indiranagar', 'koramangala', 'india', 'banaras', 'coffee', 'airport', 'cinema'],
  },
  {
    name: 'build + startup',
    keywords: ['launch', 'product', 'startup', 'ship', 'hackathon', 'founder', 'gtm', 'pmf', 'team', 'build'],
  },
  {
    name: 'career + operator',
    keywords: ['cred', 'job', 'investor', 'operator', 'hiring', 'career', 'work'],
  },
  {
    name: 'community + conversation',
    keywords: ['reply', 'anon', 'what do you think', 'where should i start', 'who should i talk to', 'friends'],
  },
]

function number(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function compactNumber(value) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value > 9999 ? 1 : 0,
  }).format(Math.round(value || 0))
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function parseCsv(text) {
  const rows = []
  let current = ''
  let row = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(current)
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  if (current || row.length) {
    row.push(current)
    rows.push(row)
  }

  const [headers, ...records] = rows
  if (!headers) return []

  return records.map((record) =>
    headers.reduce((accumulator, header, headerIndex) => {
      accumulator[header] = record[headerIndex] ?? ''
      return accumulator
    }, {}),
  )
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function detectCategory(text) {
  const lowered = text.toLowerCase()
  const matched = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => lowered.includes(keyword)),
  )
  return matched?.name ?? 'misc + personal'
}

function normalizeRows(rows) {
  return rows
    .map((row) => {
      const text = row['Post text'] ?? ''
      const date = new Date(row.Date)
      const urlClicks = number(row['URL Clicks'])
      const hasTco = /https:\/\/t\.co\//i.test(text)
      const mediaType =
        hasTco && urlClicks === 0 ? 'media' : urlClicks > 0 ? 'external-link' : 'text'

      const metrics = {
        impressions: number(row.Impressions),
        likes: number(row.Likes),
        engagements: number(row.Engagements),
        bookmarks: number(row.Bookmarks),
        shares: number(row.Shares),
        follows: number(row['New follows']),
        replies: number(row.Replies),
        reposts: number(row.Reposts),
        profileVisits: number(row['Profile visits']),
        detailExpands: number(row['Detail Expands']),
      }

      const algoScore =
        metrics.likes * ALGO_WEIGHTS.like +
        metrics.replies * ALGO_WEIGHTS.reply +
        metrics.reposts * ALGO_WEIGHTS.repost +
        metrics.bookmarks * ALGO_WEIGHTS.bookmark +
        metrics.profileVisits * ALGO_WEIGHTS.profileVisit +
        metrics.detailExpands * ALGO_WEIGHTS.detailExpand +
        metrics.shares * ALGO_WEIGHTS.share +
        metrics.follows * ALGO_WEIGHTS.follow

      return {
        id: row['Post id'],
        text,
        link: row['Post Link'],
        date,
        month: monthKey(date),
        weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
        textLength: text.length,
        isReply: text.trim().startsWith('@'),
        mediaType,
        category: detectCategory(text),
        metrics,
        algoScore,
      }
    })
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((left, right) => left.date - right.date)
}

function collectBy(rows, keyFn, valueFn) {
  const map = new Map()
  rows.forEach((row) => {
    const key = keyFn(row)
    const current = map.get(key) ?? []
    current.push(valueFn(row))
    map.set(key, current)
  })
  return map
}

function analyzeRows(rows) {
  const normalized = normalizeRows(rows)
  const originals = normalized.filter((item) => !item.isReply)
  const totals = normalized.reduce(
    (accumulator, item) => {
      accumulator.impressions += item.metrics.impressions
      accumulator.likes += item.metrics.likes
      accumulator.follows += item.metrics.follows
      accumulator.algoScore += item.algoScore
      return accumulator
    },
    { impressions: 0, likes: 0, follows: 0, algoScore: 0 },
  )

  const monthlyMap = new Map()
  normalized.forEach((item) => {
    const current = monthlyMap.get(item.month) ?? {
      label: item.month,
      impressions: 0,
      posts: 0,
      engagements: 0,
      impressionsForRate: 0,
    }
    current.impressions += item.metrics.impressions
    current.posts += 1
    current.engagements += item.metrics.engagements
    current.impressionsForRate += item.metrics.impressions
    monthlyMap.set(item.month, current)
  })

  const monthlyTrend = [...monthlyMap.values()].map((item) => ({
    label: item.label,
    impressions: item.impressions,
    posts: item.posts,
    engagementRate: item.impressionsForRate ? item.engagements / item.impressionsForRate : 0,
  }))

  const categoryPerformance = [...collectBy(originals, (item) => item.category, (item) => item.metrics.impressions).entries()]
    .map(([label, values]) => ({ label, value: average(values) }))
    .sort((left, right) => right.value - left.value)

  const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekdayPerformance = [...collectBy(originals, (item) => item.weekday, (item) => item.metrics.impressions).entries()]
    .map(([label, values]) => ({ label, value: average(values) }))
    .sort((left, right) => weekdayOrder.indexOf(left.label) - weekdayOrder.indexOf(right.label))

  const mediaVsText = ['media', 'text'].map((label) => {
    const values = originals
      .filter((item) => item.mediaType === label)
      .map((item) => item.metrics.impressions)
    return { label: label === 'media' ? 'media' : 'text-only', value: average(values) }
  })

  const lengthSweetSpot = [
    { label: '<50', test: (value) => value < 50 },
    { label: '50-100', test: (value) => value >= 50 && value <= 100 },
    { label: '101-280', test: (value) => value > 100 && value <= 280 },
    { label: '280+', test: (value) => value > 280 },
  ].map((bucket) => ({
    label: bucket.label,
    value: average(
      originals
        .filter((item) => bucket.test(item.textLength))
        .map((item) => item.metrics.impressions),
    ),
  }))

  const scoreMix = [
    { label: 'likes', value: normalized.reduce((sum, item) => sum + item.metrics.likes * ALGO_WEIGHTS.like, 0) },
    { label: 'replies', value: normalized.reduce((sum, item) => sum + item.metrics.replies * ALGO_WEIGHTS.reply, 0) },
    { label: 'reposts', value: normalized.reduce((sum, item) => sum + item.metrics.reposts * ALGO_WEIGHTS.repost, 0) },
    { label: 'bookmarks', value: normalized.reduce((sum, item) => sum + item.metrics.bookmarks * ALGO_WEIGHTS.bookmark, 0) },
    { label: 'profile visits', value: normalized.reduce((sum, item) => sum + item.metrics.profileVisits * ALGO_WEIGHTS.profileVisit, 0) },
    { label: 'follows', value: normalized.reduce((sum, item) => sum + item.metrics.follows * ALGO_WEIGHTS.follow, 0) },
  ].filter((item) => item.value > 0)

  const winning = []
  const leaving = []
  const bestCategory = categoryPerformance[0]
  const bestDay = [...weekdayPerformance].sort((left, right) => right.value - left.value)[0]
  const mediaLift =
    mediaVsText[0]?.value && mediaVsText[1]?.value
      ? mediaVsText[0].value / Math.max(mediaVsText[1].value, 1)
      : 1
  const replyHitRate =
    originals.length === 0
      ? 0
      : originals.filter((item) => item.metrics.replies > 0).length / originals.length
  const followRate = totals.impressions ? totals.follows / totals.impressions : 0

  if (bestCategory) {
    winning.push(`${bestCategory.label} is your strongest lane by average reach.`)
  }
  if (bestDay) {
    winning.push(`${bestDay.label} is your highest-upside posting day right now.`)
  }
  if (mediaLift > 1.5) {
    winning.push(`Media posts outperform text-only by ${mediaLift.toFixed(1)}x.`)
  }

  if (replyHitRate < 0.35) {
    leaving.push('Too many originals fail to spark replies, which limits algorithmic expansion.')
  }
  if (followRate < 0.0002) {
    leaving.push('Your reach is not converting into follows strongly enough yet.')
  }
  if (mediaLift > 1.5) {
    leaving.push('You are still underusing the format that already wins for you: visual-first originals.')
  }

  return {
    totals,
    posts: normalized.length,
    monthlyTrend,
    categoryPerformance,
    weekdayPerformance,
    mediaVsText,
    lengthSweetSpot,
    scoreMix,
    algoScore: totals.algoScore,
    winning,
    leaving,
  }
}

async function verifyHandle(handle) {
  const endpoint = import.meta.env.VITE_PREMIUM_CHECK_URL
  if (!endpoint) {
    return {
      ok: true,
      premium: true,
      softGate: true,
      user: { username: handle.replace('@', '') },
    }
  }

  const response = await fetch(`${endpoint}?handle=${encodeURIComponent(handle.replace('@', ''))}`)
  return response.json()
}

function ChartBars({ items, color = 'var(--accent)' }) {
  const max = Math.max(...items.map((item) => item.value || item.impressions || 0), 1)
  return (
    <div className="chart-bars">
      {items.map((item) => {
        const value = item.value ?? item.impressions ?? 0
        return (
          <div className="chart-row" key={item.label}>
            <div className="chart-meta">
              <span>{item.label}</span>
              <strong>{compactNumber(value)}</strong>
            </div>
            <div className="chart-track">
              <div
                className="chart-fill"
                style={{ width: `${(value / max) * 100}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DonutChart({ items, total }) {
  let cumulative = 0
  const palette = ['#7c8cff', '#77d4ff', '#8ef6b6', '#f5c451', '#ff8e73', '#c9a8ff']

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" className="donut-chart" aria-hidden="true">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        {items.map((item, index) => {
          const slice = (item.value / total) * 100
          const node = (
            <circle
              key={item.label}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={palette[index % palette.length]}
              strokeWidth="6"
              strokeDasharray={`${slice} ${100 - slice}`}
              strokeDashoffset={25 - cumulative}
            />
          )
          cumulative += slice
          return node
        })}
      </svg>
      <div className="legend">
        {items.map((item, index) => (
          <div className="legend-row" key={item.label}>
            <span className="legend-dot" style={{ background: palette[index % palette.length] }} />
            <span>{item.label}</span>
            <strong>{formatPercent(item.value / total, 0)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState('home')
  const [handle, setHandle] = useState('')
  const [verification, setVerification] = useState(null)
  const [status, setStatus] = useState('')
  const [fileState, setFileState] = useState({ file: null, fileName: '', valid: false })
  const [analysis, setAnalysis] = useState(null)
  const [verifying, setVerifying] = useState(false)

  async function onVerify(event) {
    event.preventDefault()
    setVerifying(true)
    setStatus('')
    try {
      const result = await verifyHandle(handle)
      if (!result.ok || !result.premium) {
        setVerification({ premium: false })
        setStatus('This tool is only accessible to verified X Premium accounts.')
        return
      }
      setVerification(result)
      setStatus('Premium account verified. Continue to export and upload.')
      setScreen('upload')
    } catch {
      setVerification({ premium: false })
      setStatus('Verification failed. Make sure the handle is correct and Premium-accessible.')
    } finally {
      setVerifying(false)
    }
  }

  async function onUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setStatus('Upload must be 10 MB or smaller.')
      setFileState({ file: null, fileName: '', valid: false })
      return
    }

    const text = await file.text()
    const rows = parseCsv(text)
    const normalized = normalizeRows(rows)
    const firstDate = normalized[0]?.date
    const lastDate = normalized[normalized.length - 1]?.date
    const monthSpan =
      firstDate && lastDate
        ? (lastDate.getFullYear() - firstDate.getFullYear()) * 12 +
          (lastDate.getMonth() - firstDate.getMonth()) +
          1
        : 0

    const validFormat =
      rows.length > 0 &&
      ['Post id', 'Date', 'Post text', 'Impressions', 'Likes', 'Engagements'].every(
        (header) => header in rows[0],
      )

    if (!validFormat || monthSpan < 11) {
      setStatus('Upload a native X analytics CSV with roughly 12 months of data between Mar 2025 and Mar 2026.')
      setFileState({ file: null, fileName: '', valid: false })
      return
    }

    setFileState({ file: rows, fileName: file.name, valid: true })
    setStatus('Upload verified. You can reveal the mirror now.')
  }

  function onReveal() {
    if (!fileState.valid) return
    setAnalysis(analyzeRows(fileState.file))
    setScreen('mirror')
  }

  const scoreTotal = analysis?.scoreMix.reduce((sum, item) => sum + item.value, 0) || 1

  return (
    <div className="app-shell">
      {screen === 'home' ? (
        <section className="screen hero-screen">
          <div className="hero-inner">
            <header className="hero-header">X Mirror</header>
            <div className="hero-block">
              <p className="hero-kicker">Nikita Bier&apos;s Worst Nightmare</p>
              <h1>personalised X growth strategy is a click away</h1>
              <p className="hero-description">
                upload one year of X analytics and get an instant reflection of hidden
                patterns: content lanes, timing, reply gaps, media lift,
                algorithm-weighted signals, and actionable reccomendations to grow 10X.
              </p>
              <button className="cta-button" onClick={() => setScreen('gate')}>
                try for free
              </button>
            </div>
            <footer className="hero-footer">
              built by{' '}
              <a href="https://x.com/wavedant_" target="_blank" rel="noreferrer">
                @wavedant_
              </a>{' '}
              from{' '}
              <a href="https://asksoca.com" target="_blank" rel="noreferrer">
                soca
              </a>
            </footer>
          </div>
        </section>
      ) : null}

      {screen === 'gate' ? (
        <section className="screen gate-screen">
          <div className="gate-layout">
            <div className="process-column">
              {[
                'export X content analytics',
                'upload for free to reveal patterns',
                'watch mirror UI uncover your personal X algo secrets',
              ].map((label, index) => (
                <div className="process-card" key={label}>
                  <span>0{index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>

            <div className="verify-panel">
              <h2>sign in without signing in</h2>
              <p>
                add your username to verify X Premium. the tool is accessible only to
                premium users. no auth required.
              </p>
              <form className="verify-form" onSubmit={onVerify}>
                <input
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  placeholder="@username"
                />
                <button className="cta-button" type="submit" disabled={!handle || verifying}>
                  {verifying ? 'checking...' : 'continue'}
                </button>
              </form>
              {status ? <div className="inline-status">{status}</div> : null}
            </div>
          </div>
        </section>
      ) : null}

      {screen === 'upload' ? (
        <section className="screen upload-screen">
          <div className="upload-layout">
            <div className="upload-card">
              <span className="label-chip">step 1</span>
              <h2>export analytics</h2>
              <p>
                export analytics for 12 months Mar 2025 - Mar 20206 for a reasonable
                and actionable analysis.
              </p>
              <a className="ghost-button" href={STEP_LINK} target="_blank" rel="noreferrer">
                open export link
              </a>
            </div>

            <div className="upload-card">
              <span className="label-chip">step 2</span>
              <h2>upload CSV</h2>
              <p>
                verify uploads for 12 months of data in desired format exported from
                twitter. max 10 mb.
              </p>
              <label className="upload-field">
                <input type="file" accept=".csv,text/csv" onChange={onUpload} />
                <span>{fileState.fileName || 'choose analytics csv'}</span>
              </label>
            </div>

            <div className="upload-card">
              <span className="label-chip">step 3</span>
              <h2>reveal mirror</h2>
              <p>once validation succeeds, reveal your custom X growth mirror.</p>
              <button className="cta-button" onClick={onReveal} disabled={!fileState.valid}>
                reveal mirror
              </button>
            </div>
          </div>
          {status ? <div className="inline-status centered">{status}</div> : null}
        </section>
      ) : null}

      {screen === 'mirror' && analysis ? (
        <section className="mirror-screen">
          <div className="mirror-head">
            <div>
              <span className="label-chip">your mirror</span>
              <h2>hidden patterns, now legible</h2>
            </div>
            <button className="ghost-button" onClick={() => setScreen('upload')}>
              upload another CSV
            </button>
          </div>

          <div className="overview-grid">
            <div className="glass-card">
              <span>impressions</span>
              <strong>{compactNumber(analysis.totals.impressions)}</strong>
            </div>
            <div className="glass-card">
              <span>tweets</span>
              <strong>{compactNumber(analysis.posts)}</strong>
            </div>
            <div className="glass-card">
              <span>new follows</span>
              <strong>{compactNumber(analysis.totals.follows)}</strong>
            </div>
            <div className="glass-card">
              <span>likes</span>
              <strong>{compactNumber(analysis.totals.likes)}</strong>
            </div>
          </div>

          <div className="mirror-grid">
            <div className="glass-panel">
              <h3>Monthly impressions vs posting volume</h3>
              <div className="dual-metric-chart">
                {analysis.monthlyTrend.map((item) => (
                  <div className="dual-row" key={item.label}>
                    <div className="dual-head">
                      <span>{item.label}</span>
                      <span>{compactNumber(item.impressions)} / {item.posts} posts</span>
                    </div>
                    <div className="dual-track">
                      <div
                        className="dual-fill primary"
                        style={{
                          width: `${(item.impressions / Math.max(...analysis.monthlyTrend.map((point) => point.impressions), 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="dual-track secondary">
                      <div
                        className="dual-fill secondary"
                        style={{
                          width: `${(item.posts / Math.max(...analysis.monthlyTrend.map((point) => point.posts), 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel">
              <h3>Content category performance</h3>
              <ChartBars items={analysis.categoryPerformance} color="#8ef6b6" />
            </div>

            <div className="glass-panel">
              <h3>Day of week performance</h3>
              <ChartBars items={analysis.weekdayPerformance} color="#77d4ff" />
            </div>

            <div className="glass-panel">
              <h3>Media vs text-only</h3>
              <ChartBars items={analysis.mediaVsText} color="#f5c451" />
            </div>

            <div className="glass-panel">
              <h3>Post length sweet spot</h3>
              <ChartBars items={analysis.lengthSweetSpot} color="#c9a8ff" />
            </div>

            <div className="glass-panel">
              <h3>Engagement rate by month</h3>
              <ChartBars
                items={analysis.monthlyTrend.map((item) => ({
                  label: item.label,
                  value: item.engagementRate * 100,
                }))}
                color="#ff8e73"
              />
            </div>

            <div className="glass-panel">
              <h3>Your algo score composition</h3>
              <div className="score-head">
                <strong>{compactNumber(analysis.algoScore)}</strong>
                <span>open-source X weighting approximation</span>
              </div>
              <DonutChart items={analysis.scoreMix} total={scoreTotal} />
            </div>

            <div className="glass-panel">
              <h3>Where you&apos;re winning</h3>
              <div className="signal-list">
                {analysis.winning.map((item) => (
                  <div className="signal-pill good" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel">
              <h3>Where you&apos;re leaving engagement on the table</h3>
              <div className="signal-list">
                {analysis.leaving.map((item) => (
                  <div className="signal-pill warn" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default App
