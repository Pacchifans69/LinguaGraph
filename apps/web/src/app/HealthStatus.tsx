import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health');
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

/**
 * Minimal server-state consumer proving TanStack Query wiring:
 * fetches GET /api/v1/health through the Vite dev proxy.
 */
export function HealthStatus() {
  const { isPending, isError, data } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  if (isPending) {
    return <span role="status">Checking API…</span>;
  }
  if (isError) {
    return <span role="status">API offline</span>;
  }
  return <span role="status">API {data.status}</span>;
}
