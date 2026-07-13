export interface ThreadScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export const THREAD_SCROLL_RELEASE_DISTANCE = 30;

export function distanceFromThreadBottom(metrics: ThreadScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

export function shouldStickToLatest(
  metrics: ThreadScrollMetrics,
  threshold = THREAD_SCROLL_RELEASE_DISTANCE,
): boolean {
  return distanceFromThreadBottom(metrics) <= threshold;
}
