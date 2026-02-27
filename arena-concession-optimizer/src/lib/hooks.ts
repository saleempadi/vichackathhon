'use client';

import { useState, useEffect } from 'react';

export function useQuery<T>(queryName: string, params?: Record<string, string>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL('/api/query', window.location.origin);
    url.searchParams.set('q', queryName);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
    }

    setLoading(true);
    fetch(url.toString())
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [queryName, JSON.stringify(params)]);

  return { data, loading, error };
}
