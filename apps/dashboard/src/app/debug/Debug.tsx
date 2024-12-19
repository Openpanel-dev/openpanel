'use client';

import { Button } from '@/components/ui/button';
import { api } from '@/trpc/client';
import { useState } from 'react';

export function Debug() {
  const [sameSite, setSameSite] = useState<'lax' | 'strict' | 'none'>('lax');
  const [domain, setDomain] = useState<string>('localhost');
  const cookiePost = api.user.debugPostCookie.useMutation();
  const cookieGet = api.user.debugGetCookie.useQuery({
    domain,
    sameSite,
  });
  return (
    <div className="col gap-8">
      <input
        className="border p-4"
        type="text"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      />
      <select
        className="border p-4"
        value={sameSite}
        onChange={(e) =>
          setSameSite(e.target.value as 'lax' | 'strict' | 'none')
        }
      >
        <option value="lax">Lax</option>
        <option value="strict">Strict</option>
        <option value="none">None</option>
      </select>
      <Button onClick={() => cookiePost.mutate({ domain, sameSite })}>
        Set Cookie (POST)
      </Button>
      <Button onClick={() => cookieGet.refetch()}>Set Cookie (GET)</Button>
    </div>
  );
}
