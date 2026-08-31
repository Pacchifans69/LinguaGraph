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

/** Compact application-level API state indicator. */
export function HealthStatus() {
  const { isPending, isError, data } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  if (isPending) {
    return (
      <span role="status" className="api-status api-status--checking">
        <span className="api-status-dot" aria-hidden="true" />
        Checking API…
      </span>
    );
  }
  if (isError) {
    return (
      <span role="status" className="api-status api-status--offline">
        <span className="api-status-dot" aria-hidden="true" />
        API offline
      </span>
    );
  }
  return (
    <span role="status" className="api-status api-status--online">
      <span className="api-status-dot" aria-hidden="true" />
      API {data.status}
    </span>
  );
}
