/**
 * Grafana deep-link generator.
 *
 * Generates pre-filled Grafana explore URLs for trace-level observability.
 * Uses Grafana's URL-driven explore state (panes format).
 */

const GRAFANA_BASE_URL = process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:31009';

interface GrafanaLinkOptions {
  traceId: string;
  fromMs?: number; // default: 15 min before now
  toMs?: number;   // default: now
}

export function buildGrafanaExploreUrl(options: GrafanaLinkOptions): string {
  const { traceId, fromMs, toMs } = options;
  const to = toMs || Date.now();
  const from = fromMs || to - 15 * 60 * 1000;

  // Loki query: search logs for this trace_id
  const lokiQuery = encodeURIComponent(`{service="rag-service"} |= "${traceId}"`);

  // Build Grafana explore URL with split panes (logs + traces)
  const params = new URLSearchParams();
  params.set('orgId', '1');
  params.set('left', JSON.stringify({
    datasource: 'Loki',
    queries: [{ refId: 'A', expr: `{service="rag-service"} |= "${traceId}"` }],
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
  }));

  return `${GRAFANA_BASE_URL}/explore?${params.toString()}`;
}

/**
 * Generate a Grafana dashboard link for the RAG overview dashboard
 * with the time range pre-set.
 */
export function buildGrafanaDashboardUrl(
  dashboardUid: string = 'rag-overview',
  fromMs?: number,
  toMs?: number
): string {
  const to = toMs || Date.now();
  const from = fromMs || to - 3600 * 1000;

  const params = new URLSearchParams();
  params.set('orgId', '1');
  params.set('from', String(from));
  params.set('to', String(to));

  return `${GRAFANA_BASE_URL}/d/${dashboardUid}?${params.toString()}`;
}

export function getGrafanaBaseUrl(): string {
  return GRAFANA_BASE_URL;
}
