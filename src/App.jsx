import { useState } from 'react'
import './App.css'

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

const PREMIUM_CHECK_COPY =
  'Premium verification is optional in this build. If you can export the analytics CSV, you already satisfy the real gate for v1.'

const STEP_LINK =
  'https://x.com/i/account_analytics/content?type=posts&sort=impressions&dir=desc&from=2025-03-01&to=2026-03-30'

const CATEGORY_RULES = [
  {
    name: 'culture + city',
    keywords: [
      'bangalore',
      'bengaluru',
      'indiranagar',
      'koramangala',
      'blue tokai',
      'vinyl',
      'banaras',
      'india',
      'airport',
      'coffee',
      'friday',
      'weekend',
      'movie',
      'cinema',
    ],
  },
  {
    name: 'build + startup',
    keywords: [
      'launch',
      'pmf',
      'startup',
      'ship',
      'product',
      'demo day',
      'hackathon',
      'founder',
      'team',
      'gtm',
      'launching',
      'building',
      'vibe coding',
      'saas',
    ],
  },
  {
    name: 'career + operator',
    keywords: [
      'cred',
      'job',
      'investor',
      'operator',
      'hiring',
      'intern',
      'work',
      'company',
      'manager',
      'career',
    ],
  },
  {
    name: 'community + conversation',
    keywords: [
      'what do you think',
      'where should i start',
      'who should i talk to',
      'reply',
      'anon',
      'townhall',
      'community',
      'friends',
      'talk',
    ],
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

function percent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
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
      if (char === '\r' && next === '\n') {
        index += 1
      }
      row.push(current)
      if (row.some((cell) => cell !== '')) {
        rows.push(row)
      }
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

  if (!rows.length) return []

  const [headers, ...records] = rows
  return records.map((record) =>
    headers.reduce((accumulator, header, headerIndex) => {
      accumulator[header] = record[headerIndex] ?? ''
      return accumulator
    }, {}),
  )
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getWeekday(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short' })
}

function detectCategory(text) {
  const lower = text.toLowerCase()
  const matched = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => lower.includes(keyword)),
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
      const isReply = text.trim().startsWith('@')
      const isThreadLike = text.length > 280
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
        date,
        dateLabel: row.Date,
        month: getMonthKey(date),
        weekday: getWeekday(date),
        text,
        link: row['Post Link'],
        category: detectCategory(text),
        metrics,
        textLength: text.length,
        isReply,
        isThreadLike,
        mediaType,
        algoScore,
      }
    })
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((left, right) => left.date - right.date)
}

function summarizeBy(items, getKey, getValue) {
  const map = new Map()
  items.forEach((item) => {
    const key = getKey(item)
    const current = map.get(key) ?? 0
    map.set(key, current + getValue(item))
  })
  return [...map.entries()].map(([label, value]) => ({ label, value }))
}

function averageBy(items, getKey, getValue) {
  const map = new Map()
  items.forEach((item) => {
    const key = getKey(item)
    const current = map.get(key) ?? { total: 0, count: 0 }
    current.total += getValue(item)
    current.count += 1
    map.set(key, current)
  })
  return [...map.entries()].map(([label, value]) => ({
    label,
    value: value.count ? value.total / value.count : 0,
    count: value.count,
  }))
}

function buildRecommendations(summary) {
  const recommendations = []

  if (summary.mediaLift > 1.8) {
    recommendations.push({
      title: 'default to visual-first originals',
      severity: 'high impact',
      takeaway: `Your media posts outperform text-only by ${summary.mediaLift.toFixed(1)}x on impressions.`,
      fix: 'Ship at least 4 visual posts a week: photo, screenshot, meme frame, or product screen. Keep text short and image-native.',
    })
  }

  if (summary.replyRate < 0.35) {
    recommendations.push({
      title: 'you are under-collecting replies',
      severity: 'urgent',
      takeaway: `${percent(summary.replyRate, 0)} of original posts get a reply. X distribution expands harder when posts create dialogue fast.`,
      fix: 'End high-intent posts with a clean prompt, disagreement hook, or ask for a story. Reply to early comments in the first 30 minutes.',
    })
  }

  if (summary.followConversion < 0.0002) {
    recommendations.push({
      title: 'reach is not converting into identity',
      severity: 'high impact',
      takeaway: `Follows per impression sit at ${percent(summary.followConversion, 3)}.`,
      fix: 'Pin one positioning post, repeat your core lens weekly, and turn viral lifestyle posts into a recognizable series instead of isolated one-offs.',
    })
  }

  if (summary.bestDay && summary.worstDay && summary.bestDay.label !== summary.worstDay.label) {
    recommendations.push({
      title: 'protect your best posting windows',
      severity: 'medium',
      takeaway: `${summary.bestDay.label} averages ${compactNumber(summary.bestDay.value)} impressions while ${summary.worstDay.label} trails at ${compactNumber(summary.worstDay.value)}.`,
      fix: 'Post your highest-upside original on your strongest day and move low-stakes replies or experiments to weaker days.',
    })
  }

  if (summary.replyShare > 0.45) {
    recommendations.push({
      title: 'too much of your output is reactive',
      severity: 'medium',
      takeaway: `${percent(summary.replyShare, 0)} of your posts are replies.`,
      fix: 'Keep replies for networking, but anchor each day with one original perspective post so the account compounds around your own narratives.',
    })
  }

  if (summary.externalLinkPenalty) {
    recommendations.push({
      title: 'external links are probably suppressing distribution',
      severity: 'medium',
      takeaway: 'Posts that look like outbound traffic underperform your main format.',
      fix: 'Make the main post self-contained and place the link in the first reply when possible.',
    })
  }

  return recommendations.slice(0, 5)
}

function analyzeRows(rows) {
  const normalized = normalizeRows(rows)
  const originals = normalized.filter((item) => !item.isReply)
  const totals = normalized.reduce(
    (accumulator, item) => {
      accumulator.impressions += item.metrics.impressions
      accumulator.likes += item.metrics.likes
      accumulator.replies += item.metrics.replies
      accumulator.reposts += item.metrics.reposts
      accumulator.bookmarks += item.metrics.bookmarks
      accumulator.follows += item.metrics.follows
      accumulator.profileVisits += item.metrics.profileVisits
      accumulator.algoScore += item.algoScore
      return accumulator
    },
    {
      impressions: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
      bookmarks: 0,
      follows: 0,
      profileVisits: 0,
      algoScore: 0,
    },
  )

  const mediaPosts = originals.filter((item) => item.mediaType === 'media')
  const textPosts = originals.filter((item) => item.mediaType === 'text')
  const externalPosts = originals.filter((item) => item.mediaType === 'external-link')
  const monthlyImpressions = summarizeBy(
    normalized,
    (item) => item.month,
    (item) => item.metrics.impressions,
  )
  const weekdayAverage = averageBy(
    originals,
    (item) => item.weekday,
    (item) => item.metrics.impressions,
  ).sort(
    (left, right) =>
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(left.label) -
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(right.label),
  )

  const categoryPerformance = averageBy(
    originals,
    (item) => item.category,
    (item) => item.metrics.impressions,
  ).sort((left, right) => right.value - left.value)

  const lengthBuckets = averageBy(
    originals,
    (item) => {
      if (item.textLength < 50) return '<50 chars'
      if (item.textLength <= 100) return '50-100 chars'
      if (item.textLength <= 280) return '101-280 chars'
      return '280+ chars'
    },
    (item) => item.metrics.impressions,
  )

  const topPosts = [...originals]
    .sort((left, right) => right.metrics.impressions - left.metrics.impressions)
    .slice(0, 5)

  const topAlgoPosts = [...originals]
    .sort((left, right) => right.algoScore - left.algoScore)
    .slice(0, 5)

  const scoreMix = [
    { label: 'likes', value: totals.likes * ALGO_WEIGHTS.like },
    { label: 'replies', value: totals.replies * ALGO_WEIGHTS.reply },
    { label: 'reposts', value: totals.reposts * ALGO_WEIGHTS.repost },
    { label: 'bookmarks', value: totals.bookmarks * ALGO_WEIGHTS.bookmark },
    { label: 'profile visits', value: totals.profileVisits * ALGO_WEIGHTS.profileVisit },
    { label: 'follows', value: totals.follows * ALGO_WEIGHTS.follow },
  ].filter((item) => item.value > 0)

  const replyRate =
    originals.length === 0
      ? 0
      : originals.filter((item) => item.metrics.replies > 0).length / originals.length
  const mediaLift =
    mediaPosts.length && textPosts.length
      ? average(mediaPosts.map((item) => item.metrics.impressions)) /
        Math.max(average(textPosts.map((item) => item.metrics.impressions)), 1)
      : 1
  const followConversion = totals.impressions ? totals.follows / totals.impressions : 0
  const bestDay = [...weekdayAverage].sort((left, right) => right.value - left.value)[0]
  const worstDay = [...weekdayAverage].sort((left, right) => left.value - right.value)[0]
  const replyShare = normalized.length ? normalized.filter((item) => item.isReply).length / normalized.length : 0
  const externalLinkPenalty =
    externalPosts.length > 0 &&
    average(externalPosts.map((item) => item.metrics.impressions)) <
      average(originals.map((item) => item.metrics.impressions))

  const narrative = [
    `You posted ${compactNumber(normalized.length)} times across the last year and generated ${compactNumber(totals.impressions)} impressions.`,
    categoryPerformance[0]
      ? `${categoryPerformance[0].label} is your strongest content lane by average reach.`
      : 'Your strongest content lane will appear once enough posts are analyzed.',
    bestDay ? `${bestDay.label} is currently your best day to place a high-upside original.` : '',
  ].filter(Boolean)

  const summary = {
    totals,
    posts: normalized.length,
    originals: originals.length,
    replyRate,
    replyShare,
    mediaLift,
    followConversion,
    bestDay,
    worstDay,
    externalLinkPenalty,
  }

  return {
    summary,
    narrative,
    monthlyImpressions,
    weekdayAverage,
    categoryPerformance,
    lengthBuckets,
    topPosts,
    topAlgoPosts,
    scoreMix,
    recommendations: buildRecommendations(summary),
    rows: normalized,
  }
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function BarChart({ title, items, color = 'var(--accent)' }) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>{title}</h3>
      </div>
      <div className="bars">
        {items.map((item) => (
          <div className="bar-row" key={item.label}>
            <div className="bar-meta">
              <span>{item.label}</span>
              <strong>{compactNumber(item.value)}</strong>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(item.value / max) * 100}%`, background: color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ title, items }) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1
  let cumulative = 0
  const palette = ['#f5c451', '#77d4ff', '#7c8cff', '#8ef6b6', '#ff8e73', '#c9a8ff']

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>{title}</h3>
        <span>{compactNumber(total)} points</span>
      </div>
      <div className="donut-layout">
        <svg viewBox="0 0 42 42" className="donut-chart" aria-hidden="true">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#1a1d27" strokeWidth="6" />
          {items.map((item, index) => {
            const dash = (item.value / total) * 100
            const circle = (
              <circle
                key={item.label}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={palette[index % palette.length]}
                strokeWidth="6"
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={25 - cumulative}
              />
            )
            cumulative += dash
            return circle
          })}
        </svg>
        <div className="donut-legend">
          {items.map((item, index) => (
            <div className="legend-row" key={item.label}>
              <span
                className="legend-dot"
                style={{ background: palette[index % palette.length] }}
              />
              <span>{item.label}</span>
              <strong>{percent(item.value / total, 0)}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InsightCard({ label, value, detail }) {
  return (
    <div className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function PostList({ title, posts, by = 'impressions' }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      <div className="post-list">
        {posts.map((post) => (
          <a className="post-row" key={post.id} href={post.link} target="_blank" rel="noreferrer">
            <div>
              <strong>{post.text || '(no text)'}</strong>
              <span>{post.dateLabel}</span>
            </div>
            <b>{compactNumber(by === 'algo' ? post.algoScore : post.metrics.impressions)}</b>
          </a>
        ))}
      </div>
    </div>
  )
}

async function saveAnalysis({ handle, verification, rows, analysis }) {
  const endpoint = import.meta.env.VITE_ANALYSIS_SAVE_URL
  if (!endpoint) return { skipped: true }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      twitterHandle: handle,
      twitterId: verification?.user?.id ?? null,
      verification,
      rows,
      analysis,
    }),
  })

  if (!response.ok) {
    throw new Error('Could not save analysis')
  }

  return response.json()
}

async function verifyHandle(handle) {
  const endpoint = import.meta.env.VITE_PREMIUM_CHECK_URL
  if (!endpoint) {
    return {
      ok: true,
      premium: true,
      softGate: true,
      note: PREMIUM_CHECK_COPY,
      user: { username: handle.replace('@', '') },
    }
  }

  const response = await fetch(`${endpoint}?handle=${encodeURIComponent(handle.replace('@', ''))}`)
  if (!response.ok) {
    throw new Error('Could not verify handle')
  }
  return response.json()
}

function App() {
  const [handle, setHandle] = useState('')
  const [verification, setVerification] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [status, setStatus] = useState('')
  const [saveState, setSaveState] = useState('')

  async function onVerify(event) {
    event.preventDefault()
    setStatus('')
    setVerifying(true)
    try {
      const result = await verifyHandle(handle)
      if (!result.ok || !result.premium) {
        setVerification({ ...result, premium: false })
        setStatus('This tool is currently gated to X Premium users because the export source lives inside Premium analytics.')
        return
      }
      setVerification(result)
      setStatus(result.softGate ? PREMIUM_CHECK_COPY : 'Handle verified. You can upload your analytics export now.')
    } catch (error) {
      setStatus('Handle verification failed. You can still continue if you already have the Premium analytics CSV.')
      setVerification({
        ok: true,
        premium: true,
        softGate: true,
        note: PREMIUM_CHECK_COPY,
        user: { username: handle.replace('@', '') },
      })
    } finally {
      setVerifying(false)
    }
  }

  async function onUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setStatus('Parsing your analytics and looking for patterns...')

    try {
      const text = await file.text()
      const rows = parseCsv(text)
      const nextAnalysis = analyzeRows(rows)
      setAnalysis(nextAnalysis)
      setStatus('Mirror ready. Your report is organized for quick reading and screenshots.')

      try {
        setSaveState('Saving analysis...')
        await saveAnalysis({
          handle,
          verification,
          rows,
          analysis: nextAnalysis,
        })
        setSaveState('Saved to backend.')
      } catch {
        setSaveState('Analysis generated locally. Backend save is not configured yet.')
      }
    } catch {
      setStatus('The CSV could not be parsed. Upload the native X analytics export without editing the columns.')
    }
  }

  const canUpload = verification?.premium

  return (
    <div className="page-shell">
      <section className="hero-shell">
        <div className="topline">
          <span className="brand">x mirror</span>
          <a href="https://x.com/wavedant_" target="_blank" rel="noreferrer">
            built by @wavedant_ from soca
          </a>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow accent">nikita bier&apos;s worst nightmare</span>
            <h1>find the hidden patterns shaping your X growth.</h1>
            <p className="hero-body">
              Upload one year of X analytics and get an instant reflection of what is
              actually working: content lanes, timing, reply gaps, media lift,
              algorithm-weighted signals, and the actions that matter next.
            </p>

            <div className="hero-actions">
              <a href="#intake" className="primary-button">
                find hidden patterns
              </a>
              <a href={STEP_LINK} target="_blank" rel="noreferrer" className="ghost-button">
                open analytics export
              </a>
            </div>

            <div className="proof-strip">
              <div>
                <strong>not a posting agent</strong>
                <span>a reflection layer for creators</span>
              </div>
              <div>
                <strong>client-side analysis</strong>
                <span>fast by default, backend optional</span>
              </div>
              <div>
                <strong>launch-first architecture</strong>
                <span>static frontend + tiny API surface</span>
              </div>
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-head">
              <h3>what unfolds</h3>
            </div>
            <div className="stack-list">
              <div className="stack-item">
                <span>01</span>
                <div>
                  <strong>verify handle</strong>
                  <p>Gate the tool to Premium-capable users.</p>
                </div>
              </div>
              <div className="stack-item">
                <span>02</span>
                <div>
                  <strong>upload analytics CSV</strong>
                  <p>Use the native export from X analytics.</p>
                </div>
              </div>
              <div className="stack-item">
                <span>03</span>
                <div>
                  <strong>get the mirror</strong>
                  <p>Patterns, charts, category wins, algorithm framing, and next moves.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="intake-shell" id="intake">
        <div className="step-card">
          <span className="eyebrow">step 1</span>
          <h2>enter your X handle</h2>
          <p>
            We use this as the identity anchor for the analysis. If you wire a real
            verification endpoint, this is where blue-check gating happens.
          </p>
          <form className="handle-form" onSubmit={onVerify}>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@wavedant_"
              aria-label="Twitter handle"
            />
            <button type="submit" className="primary-button" disabled={!handle || verifying}>
              {verifying ? 'verifying...' : 'verify premium'}
            </button>
          </form>
          {verification ? (
            <div className={`status-pill ${verification.premium ? 'ok' : 'warn'}`}>
              {verification.premium ? 'Premium access cleared' : 'Premium access required'}
            </div>
          ) : null}
        </div>

        <div className="step-card">
          <span className="eyebrow">step 2</span>
          <h2>export your analytics CSV</h2>
          <p>
            Open the X analytics export page, set your date range, and download the
            content-level CSV.
          </p>
          <a href={STEP_LINK} target="_blank" rel="noreferrer" className="ghost-button full">
            open export page
          </a>
        </div>

        <div className="step-card">
          <span className="eyebrow">step 3</span>
          <h2>upload and reveal the mirror</h2>
          <p>
            The report highlights your best content categories, hidden drop-offs, and
            what aligns with distribution dynamics on X.
          </p>
          <label className={`upload-zone ${canUpload ? '' : 'disabled'}`}>
            <input type="file" accept=".csv,text/csv" onChange={onUpload} disabled={!canUpload} />
            <span>{fileName || 'choose analytics CSV'}</span>
          </label>
        </div>
      </section>

      {status ? (
        <section className="status-shell">
          <div className="status-banner">{status}</div>
          {saveState ? <div className="status-subtle">{saveState}</div> : null}
        </section>
      ) : null}

      {analysis ? (
        <section className="results-shell">
          <div className="results-head">
            <div>
              <span className="eyebrow accent">your mirror</span>
              <h2>quick read first, deep dive after</h2>
            </div>
            <p>
              This view is designed to be screenshot-friendly for X and Product Hunt.
            </p>
          </div>

          <div className="narrative-grid">
            {analysis.narrative.map((item) => (
              <div className="takeaway-card" key={item}>
                <strong>{item}</strong>
              </div>
            ))}
          </div>

          <div className="metrics-grid">
            <InsightCard
              label="total impressions"
              value={compactNumber(analysis.summary.totals.impressions)}
              detail="Total annual reach across all exported posts."
            />
            <InsightCard
              label="reply hit rate"
              value={percent(analysis.summary.replyRate, 0)}
              detail="Share of original posts that received at least one reply."
            />
            <InsightCard
              label="media lift"
              value={`${analysis.summary.mediaLift.toFixed(1)}x`}
              detail="Average impression lift from media posts vs text-only posts."
            />
            <InsightCard
              label="follow conversion"
              value={percent(analysis.summary.followConversion, 3)}
              detail="How much of your reach becomes follows."
            />
          </div>

          <div className="chart-grid">
            <DonutChart title="algorithm signal mix" items={analysis.scoreMix} />
            <BarChart title="monthly impressions" items={analysis.monthlyImpressions} />
            <BarChart title="weekday average impressions" items={analysis.weekdayAverage} color="#77d4ff" />
            <BarChart title="content lane performance" items={analysis.categoryPerformance} color="#8ef6b6" />
          </div>

          <div className="chart-grid two-up">
            <BarChart title="post length sweet spot" items={analysis.lengthBuckets} color="#f5c451" />
            <div className="panel">
              <div className="panel-head">
                <h3>actionable takeaways</h3>
              </div>
              <div className="recommendations">
                {analysis.recommendations.map((item) => (
                  <div className="recommendation-card" key={item.title}>
                    <div className="recommendation-head">
                      <strong>{item.title}</strong>
                      <span>{item.severity}</span>
                    </div>
                    <p>{item.takeaway}</p>
                    <b>fix: {item.fix}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-grid two-up">
            <PostList title="top posts by impressions" posts={analysis.topPosts} />
            <PostList title="top posts by algorithm score" posts={analysis.topAlgoPosts} by="algo" />
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default App
