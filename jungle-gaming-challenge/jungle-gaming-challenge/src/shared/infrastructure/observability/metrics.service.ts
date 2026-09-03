import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  constructor() {
    this.counters.set('wager_transactions_total{status="none"}', 0);
    this.counters.set('wager_duplicates_total', 0);
    this.counters.set('wager_retries_total', 0);
    this.counters.set('wager_dlq_total', 0);
    this.counters.set('wallet_lock_conflicts_total', 0);
    this.counters.set('wallet_reconciliation_divergences_total', 0);
    this.counters.set('wager_processing_latency_ms_count', 0);
    this.counters.set('wager_processing_latency_ms_sum_ms', 0);
    this.gauges.set('outbox_lag_ms', 0);
  }

  increment(
    name: string,
    labels: Record<string, string> = {},
    value = 1,
  ): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  gauge(
    name: string,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    this.gauges.set(this.key(name, labels), value);
  }

  observeLatency(name: string, milliseconds: number): void {
    this.increment(`${name}_count`);
    this.increment(`${name}_sum_ms`, {}, milliseconds);
  }

  render(): string {
    const lines = [...this.counters.entries(), ...this.gauges.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key} ${value}`);

    return lines.join('\n') + '\n';
  }

  private key(name: string, labels: Record<string, string>): string {
    const entries = Object.entries(labels).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    if (entries.length === 0) return name;
    return `${name}{${entries
      .map(([key, value]) => `${key}="${value.replaceAll('"', '\\"')}"`)
      .join(',')}}`;
  }
}
