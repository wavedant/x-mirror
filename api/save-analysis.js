export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return response.status(200).json({
      ok: true,
      skipped: true,
      note: 'Supabase is not configured yet.',
    })
  }

  try {
    const body =
      typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {}

    const payload = {
      twitter_handle: body.twitterHandle,
      twitter_id: body.twitterId,
      verification_json: body.verification,
      rows_json: body.rows,
      analysis_json: body.analysis,
      total_posts: body.analysis?.summary?.posts ?? 0,
      total_impressions: body.analysis?.summary?.totals?.impressions ?? 0,
    }

    const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/analyses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    })

    if (!supabaseResponse.ok) {
      const text = await supabaseResponse.text()
      return response.status(supabaseResponse.status).json({
        ok: false,
        error: 'Supabase insert failed',
        detail: text,
      })
    }

    return response.status(200).json({ ok: true })
  } catch (error) {
    return response.status(500).json({
      ok: false,
      error: 'Save failed',
      detail: error.message,
    })
  }
}
