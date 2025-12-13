Add a minimal helper to retrieve the current Supabase session access_token and a small utility to call the Edge Function mint-lead-link with that token. I’m using Vite + supabase-js and CRUD already works. Create:

1. src/lib/session.ts exporting getAccessToken() using supabase.auth.getSession().
2. src/lib/callMintLeadLink.ts exporting callMintLeadLink(id: string) that calls https://efzqxjpfewkrgpdootte.functions.supabase.co/mint-lead-link?id= with Authorization: Bearer , handles 401 by refreshing the session once, and throws with response text on failure.
3. A simple React component src/components/MintLeadLinkButton.tsx that calls callMintLeadLink, shows loading/error/result, and is easy to drop into a page.

Use TypeScript, no external deps, keep code concise.”

Example code Copilot should generate:

1. src/lib/session.ts

```ts
import { supabase } from './supabaseClient'
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('getSession error', error)
    return null
  }
  return data.session?.access_token ?? null
}
```

1. src/lib/callMintLeadLink.ts

```ts
import { supabase } from './supabaseClient'
import { getAccessToken } from './session'
const FN_URL = 'https://efzqxjpfewkrgpdootte.functions.supabase.co/mint-lead-link'
export async function callMintLeadLink(id: string) {
  let token = await getAccessToken()
  if (!token) {
    // Attempt to refresh once if we somehow lack a token
    await supabase.auth.refreshSession()
    token = await getAccessToken()
  }
  if (!token) throw new Error('No Supabase access token. Ensure the user is signed in.')
  const url = `${FN_URL}?id=${encodeURIComponent(id)}`
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  // Retry once on 401 after refreshing session
  if (res.status === 401) {
    await supabase.auth.refreshSession()
    const token2 = await getAccessToken()
    if (!token2) throw new Error('Unable to refresh Supabase session')
    res = await fetch(url, { headers: { Authorization: `Bearer ${token2}` } })
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Edge Function failed: ${res.status} ${body}`)
  }
  return res.json()
}
```

1. src/components/MintLeadLinkButton.tsx

```tsx
import { useState } from 'react'
import { callMintLeadLink } from '../lib/callMintLeadLink'
export default function MintLeadLinkButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const mint = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await callMintLeadLink('58ceefe9-0356-4b83-841f-a575e14127d8')
      setResult(data)
    } catch (e: any) {
      setError(e.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div>
      <button onClick={mint} disabled={loading}>
        {loading ? 'Minting…' : 'Mint Lead Link'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}
```

Optional follow-ups you can ask Copilot to do next:

- Add a toast notification instead of inline error/result UI.
- Parameterize the id via props or a text input.
- Centralize function base URL in a config file.