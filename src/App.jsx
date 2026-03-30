import { useState } from 'react'
import './App.css'

const STEP_LINK =
  'https://x.com/i/account_analytics/content?type=posts&sort=impressions&dir=desc&from=2025-03-01&to=2026-03-30'

const ALGO_WEIGHTS = {
  like: 1,
  reply: 13.5,
  repost: 20,
  bookmark: 10,
  profileVisit: 12,
  urlClick: 11,
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

function monthLabelFromKey(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

function detectCategory(text) {
  const lowered = text.toLowerCase()
  const matched = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => lowered.includes(keyword)),
  )
  return matched?.name ?? 'misc + personal'
}

function calculateAlgoScore(metrics) {
  return (
    metrics.likes * ALGO_WEIGHTS.like +
    metrics.replies * ALGO_WEIGHTS.reply +
    metrics.reposts * ALGO_WEIGHTS.repost +
    metrics.bookmarks * ALGO_WEIGHTS.bookmark +
    metrics.profileVisits * ALGO_WEIGHTS.profileVisit +
    metrics.urlClicks * ALGO_WEIGHTS.urlClick
  )
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
        urlClicks: number(row['URL Clicks']),
      }

      const algoScore = calculateAlgoScore(metrics)

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
    displayLabel: monthLabelFromKey(item.label),
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
    const matching = originals.filter((item) => item.mediaType === label)
    return {
      label: label === 'media' ? 'media' : 'text-only',
      value: average(matching.map((item) => item.metrics.impressions)),
      likes: average(matching.map((item) => item.metrics.likes)),
      posts: matching.length,
    }
  })

  const lengthSweetSpot = [
    { label: '<50', test: (value) => value < 50 },
    { label: '50-100', test: (value) => value >= 50 && value <= 100 },
    { label: '100-200', test: (value) => value > 100 && value <= 200 },
    { label: '200-280', test: (value) => value > 200 && value <= 280 },
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
    {
      label: 'Profile visits',
      formula: "Profile visits × 12",
      value: normalized.reduce((sum, item) => sum + item.metrics.profileVisits * ALGO_WEIGHTS.profileVisit, 0),
    },
    {
      label: 'Bookmarks',
      formula: "Bookmarks × 10",
      value: normalized.reduce((sum, item) => sum + item.metrics.bookmarks * ALGO_WEIGHTS.bookmark, 0),
    },
    {
      label: 'URL clicks',
      formula: "URL clicks × 11",
      value: normalized.reduce((sum, item) => sum + item.metrics.urlClicks * ALGO_WEIGHTS.urlClick, 0),
    },
    {
      label: 'Likes',
      formula: "Likes × 1",
      value: normalized.reduce((sum, item) => sum + item.metrics.likes * ALGO_WEIGHTS.like, 0),
    },
    {
      label: 'Replies',
      formula: "Replies × 13.5",
      value: normalized.reduce((sum, item) => sum + item.metrics.replies * ALGO_WEIGHTS.reply, 0),
    },
    {
      label: 'Reposts',
      formula: "Retweets × 20",
      value: normalized.reduce((sum, item) => sum + item.metrics.reposts * ALGO_WEIGHTS.repost, 0),
    },
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

  const recommendations = []

  if (mediaLift > 1.5) {
    recommendations.push({
      title: 'default to media-first originals',
      detail: `Your media posts already outperform text-only by ${mediaLift.toFixed(1)}x. Shift at least 70% of your original posts to photo, screenshot, or visual-led formats.`,
    })
  }

  if (replyHitRate < 0.35) {
    recommendations.push({
      title: 'optimize for replies, not just impressions',
      detail: `Only ${formatPercent(replyHitRate, 0)} of your original posts spark replies. Add a disagreement hook, direct question, or opinion-led ending to every important post.`,
    })
  }

  if (bestDay) {
    recommendations.push({
      title: 'protect your highest-leverage posting window',
      detail: `${bestDay.label} is your strongest day. Post your highest-upside original there and move low-signal replies or experiments to weaker days.`,
    })
  }

  if (bestCategory) {
    recommendations.push({
      title: 'double down on your winning content lane',
      detail: `${bestCategory.label} is your strongest category by average reach. Turn it into a repeatable series instead of occasional isolated posts.`,
    })
  }

  if (followRate < 0.0002) {
    recommendations.push({
      title: 'convert reach into follows with a sharper identity',
      detail: `Your follow conversion is only ${formatPercent(followRate, 3)}. Pin a positioning post, repeat your core lens weekly, and make viral posts point back to a recognizable theme.`,
    })
  }

  if (recommendations.length < 5) {
    recommendations.push({
      title: 'reduce outbound-link dependence',
      detail: 'Keep the main post self-contained and move links into the first reply so the post can compete on-native before sending users away.',
    })
  }

  const avgPostsPerDay = normalized.length / 365
  const avgImpressionsPerPost = totals.impressions / Math.max(normalized.length, 1)
  const avgLikesPerPost = totals.likes / Math.max(normalized.length, 1)
  const peakFollowMonth = [...monthlyTrend]
    .map((item) => ({
      label: item.displayLabel,
      follows: normalized
        .filter((row) => row.month === item.label)
        .reduce((sum, row) => sum + row.metrics.follows, 0),
    }))
    .sort((left, right) => right.follows - left.follows)[0]

  const deepDive = {
    whatDataSays: [
      bestCategory
        ? `${bestCategory.label} is your strongest lane, which means your breakout reach is coming from that content pattern rather than evenly across everything you post.`
        : 'A few content patterns are driving most of your reach rather than all formats performing equally.',
      mediaLift > 1.2
        ? `Media is your biggest lever. Visual posts outperform text-only by ${mediaLift.toFixed(1)}x, so your best-performing content is usually image-led rather than plain-text.`
        : 'Media format is not creating a huge edge yet, so the account is relying more on topic and timing than pure format advantage.',
      bestDay
        ? `${bestDay.label} is your highest-upside posting window, while weaker weekday slots are likely being dragged down by reactive or conversational posting.`
        : 'Your timing pattern is uneven, with certain days creating much more upside than others.',
      `Reach is not converting into follows strongly enough yet, which means people enjoy the posts but the account identity is not sharp enough to consistently earn the follow.`,
    ],
    whatAlgoSays: [
      `Your issue is structural, not creative. You already create posts that attract attention, but too much of the score is coming from passive signals instead of conversation-heavy ones.`,
      replyHitRate < 0.35
        ? `Not enough originals are earning replies, so the account is generating curiosity without enough dialogue to fully unlock downstream distribution.`
        : `Replies are showing up often enough to help distribution, but there is still room to turn more attention into conversation.`,
    ],
    whatToChange: [
      'Design every important post to earn replies with a question, sharp opinion, or response hook.',
      'Add a self-reply within the first hour to extend the life of strong posts.',
      mediaLift > 1.2
        ? 'Make media the default format because that is already your clearest performance advantage.'
        : 'Test more media-led posts to see if visuals can create a stronger distribution edge.',
      `Post originals more consistently so the account compounds around your own voice, not just replies.`,
      'Front-load the topic in the first line so X can route the post correctly.',
      'Build a few posts specifically for reposts, not just likes.',
      'Keep links out of the main post and move them into the first reply.',
      bestDay
        ? `Protect your best window by saving your strongest originals for ${bestDay.label} or the surrounding high-upside period.`
        : 'Protect your strongest posting windows once timing patterns become clearer.',
    ],
    coreTakeaway:
      'The growth unlock is not simply writing better tweets. It is publishing more reply-driven, media-led, identity-consistent posts that turn attention into interaction and interaction into follows.',
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
    recommendations: recommendations.slice(0, 6),
    overview: {
      avgPostsPerDay,
      avgImpressionsPerPost,
      avgLikesPerPost,
      peakFollowMonth: peakFollowMonth?.label ?? 'n/a',
      peakFollows: peakFollowMonth?.follows ?? 0,
    },
    deepDive,
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

function ChartBars({ items, color = 'var(--accent)', horizontal = false, percentSuffix = '' }) {
  const max = Math.max(...items.map((item) => item.value || item.impressions || 0), 1)
  return (
    <div className={`chart-bars ${horizontal ? 'horizontal' : ''}`}>
      {items.map((item) => {
        const value = item.value ?? item.impressions ?? 0
        return (
          <div className="chart-row" key={item.label}>
            <div className="chart-meta">
              <span>{item.label}</span>
              <strong>{percentSuffix ? `${value.toFixed(1)}${percentSuffix}` : compactNumber(value)}</strong>
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

function MonthlyComboChart({ items }) {
  const maxImpressions = Math.max(...items.map((item) => item.impressions), 1)
  const maxPosts = Math.max(...items.map((item) => item.posts), 1)

  return (
    <div className="combo-chart">
      <div className="combo-legend">
        <span><i className="legend-swatch blue" />Impressions</span>
        <span><i className="legend-swatch gold" />Posts</span>
      </div>
      <div className="combo-grid">
        <svg className="combo-line" viewBox={`0 0 ${items.length * 70} 220`} preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="#e8a53d"
            strokeWidth="3"
            points={items
              .map((item, index) => {
                const x = index * 70 + 35
                const y = 200 - (item.posts / maxPosts) * 160
                return `${x},${y}`
              })
              .join(' ')}
          />
          {items.map((item, index) => {
            const x = index * 70 + 35
            const y = 200 - (item.posts / maxPosts) * 160
            return <circle key={item.label} cx={x} cy={y} r="5" fill="#e8a53d" />
          })}
        </svg>

        {items.map((item) => (
          <div className="combo-col" key={item.label}>
            <div className="combo-bar-wrap">
              <div
                className="combo-bar"
                style={{ height: `${(item.impressions / maxImpressions) * 100}%` }}
              />
            </div>
            <span>{item.displayLabel}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AreaChart({ items }) {
  const width = items.length * 72
  const height = 220
  const max = Math.max(...items.map((item) => item.value), 1)
  const points = items.map((item, index) => {
    const x = index * 72 + 24
    const y = height - (item.value / max) * 170 - 20
    return { ...item, x, y }
  })
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `0,${height} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${width},${height}`

  return (
    <div className="area-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="area-chart" preserveAspectRatio="none">
        <polygon points={area} className="area-fill" />
        <polyline points={line} className="area-line" />
        {points.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="5" className="area-dot" />
        ))}
      </svg>
      <div className="area-labels">
        {items.map((item) => (
          <span key={item.label}>{item.displayLabel}</span>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ items, total }) {
  let cumulative = 0
  const palette = ['#7c8cff', '#77d4ff', '#8ef6b6', '#f5c451', '#ff8e73', '#c9a8ff']

  return (
    <svg viewBox="0 0 42 42" className="donut-chart" aria-hidden="true">
      <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
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
  )
}

function ScoreComposition({ items, total, score }) {
  const ranked = [...items].sort((left, right) => right.value - left.value)
  return (
    <div className="score-layout">
      <div className="score-copy">
        <strong>{compactNumber(score)}</strong>
        <p>
          Your score is mostly driven by the signals below. Higher-share rows are the
          biggest levers shaping distribution.
        </p>
      </div>
      <div className="score-visual">
        <div className="score-donut-block">
          <DonutChart items={ranked} total={total} />
          <div className="score-formula">
            X formula: Likes × 1 + Retweets × 20 + Replies × 13.5 + Profile Clicks × 12 +
            Link Clicks × 11 + Bookmarks × 10
          </div>
        </div>
        <div className="score-breakdown">
          {ranked.map((item, index) => (
            <div className="score-row" key={item.label}>
              <div className="score-row-copy">
                <i
                  className="score-dot"
                  style={{
                    background: ['#7c8cff', '#77d4ff', '#8ef6b6', '#f5c451', '#ff8e73', '#c9a8ff'][index % 6],
                  }}
                />
                <span>{item.formula}</span>
              </div>
              <strong>{formatPercent(item.value / total, 1)}</strong>
            </div>
          ))}
        </div>
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
      setStatus('')
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

    const text = await file.text()
    const rows = parseCsv(text)
    if (!rows.length) {
      setStatus('Upload a CSV file to continue.')
      setFileState({ file: null, fileName: '', valid: false })
      return
    }

    setFileState({ file: rows, fileName: file.name, valid: true })
    setStatus('')
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
              <div className="premium-callout">works only for X premium users</div>
              <p>
                add your username to verify X Premium access. no auth required.
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
              <p>open X analytics and export your content analytics CSV.</p>
              <a className="ghost-button" href={STEP_LINK} target="_blank" rel="noreferrer">
                open export link
              </a>
            </div>

            <div className="upload-card">
              <span className="label-chip">step 2</span>
              <h2>upload CSV</h2>
              <p>upload your analytics CSV to start generating the mirror.</p>
              <label className="upload-field">
                <input type="file" accept=".csv,text/csv" onChange={onUpload} />
                <span>{fileState.fileName || 'choose analytics csv'}</span>
              </label>
            </div>

            <div className="upload-card">
              <span className="label-chip">step 3</span>
              <h2>reveal mirror</h2>
              <p>reveal your custom X growth mirror.</p>
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
              <span>Total posts</span>
              <strong>{compactNumber(analysis.posts)}</strong>
              <small>~{analysis.overview.avgPostsPerDay.toFixed(1)}/day avg</small>
            </div>
            <div className="glass-card">
              <span>Impressions</span>
              <strong>{compactNumber(analysis.totals.impressions)}</strong>
              <small>{compactNumber(analysis.overview.avgImpressionsPerPost)} avg/post</small>
            </div>
            <div className="glass-card">
              <span>Likes</span>
              <strong>{compactNumber(analysis.totals.likes)}</strong>
              <small>{analysis.overview.avgLikesPerPost.toFixed(1)} avg/post</small>
            </div>
            <div className="glass-card">
              <span>New follows</span>
              <strong>{compactNumber(analysis.totals.follows)}</strong>
              <small>
                Peak: {analysis.overview.peakFollowMonth}
                {analysis.overview.peakFollows ? ` (${analysis.overview.peakFollows})` : ''}
              </small>
            </div>
          </div>

          <div className="mirror-grid">
            <div className="glass-panel">
              <h3>Monthly impressions vs posting volume</h3>
              <MonthlyComboChart items={analysis.monthlyTrend} />
            </div>

            <div className="glass-panel">
              <h3>Content category performance</h3>
              <ChartBars items={analysis.categoryPerformance} color="#de6645" horizontal />
            </div>

            <div className="glass-panel">
              <h3>Day of week performance</h3>
              <ChartBars items={analysis.weekdayPerformance} color="#de6645" />
            </div>

            <div className="glass-panel">
              <h3>Media vs text-only</h3>
              <div className="comparison-grid">
                {analysis.mediaVsText.map((item) => (
                  <div className="comparison-card" key={item.label}>
                    <span>{item.label === 'media' ? `With media (${item.posts} posts)` : `Text-only (${item.posts} posts)`}</span>
                    <strong>{compactNumber(item.value)}</strong>
                    <small>avg impressions / {item.likes.toFixed(1)} avg likes</small>
                  </div>
                ))}
              </div>
              <p className="comparison-note">
                Media posts get{' '}
                {(analysis.mediaVsText[0]?.value / Math.max(analysis.mediaVsText[1]?.value || 1, 1)).toFixed(1)}x
                {' '}more impressions and{' '}
                {(analysis.mediaVsText[0]?.likes / Math.max(analysis.mediaVsText[1]?.likes || 1, 1)).toFixed(1)}x
                {' '}more likes
              </p>
            </div>

            <div className="glass-panel">
              <h3>Post length sweet spot</h3>
              <ChartBars items={analysis.lengthSweetSpot} color="#7d73d2" />
            </div>

            <div className="glass-panel">
              <h3>Engagement rate by month</h3>
              <AreaChart
                items={analysis.monthlyTrend.map((item) => ({
                  label: item.label,
                  displayLabel: item.displayLabel,
                  value: item.engagementRate * 100,
                }))}
              />
            </div>

            <div className="glass-panel">
              <h3>Your algo score composition</h3>
              <ScoreComposition
                items={analysis.scoreMix}
                total={scoreTotal}
                score={analysis.algoScore}
              />
            </div>

            <div className="glass-panel">
              <h3>Where you&apos;re winning</h3>
              <div className="signal-list">
                {analysis.winning.map((item) => (
                  <div className="signal-card good" key={item}>
                    <strong>winning signal</strong>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel">
              <h3>Where you&apos;re leaving engagement on the table</h3>
              <div className="signal-list">
                {analysis.leaving.map((item) => (
                  <div className="signal-card warn" key={item}>
                    <strong>gap to fix</strong>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="recommendations-tab">
            <div className="recommendations-head">
              <div>
                <span className="label-chip">final tab</span>
                <h3>actionable reccomendations</h3>
              </div>
              <p>
                exact changes to make if you want to 10X engagement from what worked
                over the last 12 months.
              </p>
            </div>

            <div className="recommendation-grid">
              {analysis.recommendations.map((item, index) => (
                <div className="recommendation-card" key={item.title}>
                  <span>0{index + 1}</span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="deep-dive-tab">
            <div className="recommendations-head">
              <div>
                <span className="label-chip">deep dive</span>
                <h3>what your X analysis actually means</h3>
              </div>
              <p>Compressed interpretation of the data, the algorithmic implication, and what to change next.</p>
            </div>

            <div className="deep-dive-grid">
              <div className="deep-dive-card">
                <strong>What your data says</strong>
                {analysis.deepDive.whatDataSays.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>

              <div className="deep-dive-card">
                <strong>What the algo is telling you</strong>
                {analysis.deepDive.whatAlgoSays.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>

              <div className="deep-dive-card wide">
                <strong>What to change</strong>
                {analysis.deepDive.whatToChange.map((item, index) => (
                  <p key={item}>
                    {index + 1}. {item}
                  </p>
                ))}
              </div>

              <div className="deep-dive-card wide takeaway">
                <strong>Core takeaway</strong>
                <p>{analysis.deepDive.coreTakeaway}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default App
