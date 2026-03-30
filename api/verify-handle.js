export default async function handler(request, response) {
  const handle = String(request.query.handle || '').replace('@', '').trim()

  if (!handle) {
    return response.status(400).json({ ok: false, error: 'Missing handle' })
  }

  const bearerToken = process.env.X_BEARER_TOKEN

  if (!bearerToken) {
    return response.status(200).json({
      ok: true,
      premium: true,
      softGate: true,
      note: 'No X API token configured. Falling back to soft gating based on CSV export access.',
      user: { username: handle },
    })
  }

  try {
    const apiResponse = await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(
        handle,
      )}?user.fields=verified,verified_type,profile_image_url,name,username`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    )

    if (!apiResponse.ok) {
      const text = await apiResponse.text()
      return response.status(apiResponse.status).json({
        ok: false,
        error: 'X lookup failed',
        detail: text,
      })
    }

    const payload = await apiResponse.json()
    const user = payload.data ?? {}
    const premium =
      user.verified_type === 'blue' ||
      user.verified_type === 'business' ||
      user.verified === true

    return response.status(200).json({
      ok: true,
      premium,
      softGate: false,
      user: {
        id: user.id ?? null,
        name: user.name ?? handle,
        username: user.username ?? handle,
        avatar: user.profile_image_url ?? null,
        verifiedType: user.verified_type ?? null,
      },
    })
  } catch (error) {
    return response.status(500).json({
      ok: false,
      error: 'Verification failed',
      detail: error.message,
    })
  }
}
