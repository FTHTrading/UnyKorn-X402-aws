/**
 * @unykorn/telemetry — Metrics & Event Collection
 *
 * Lightweight in-memory telemetry collector for metrics and events.
 * Production implementations should flush to an external store.
 */

import { nanoid } from "nanoid";

// ═══════════════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════════════

export interface Metric {
  metricId: string;
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: string;
}

export interface TelemetryEvent {
  eventId: string;
  type: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface TimeRange {
  since: string; // ISO timestamp
  until: string; // ISO timestamp
}

// ═══════════════════════════════════════════════════════════
// Telemetry Collector
// ═══════════════════════════════════════════════════════════

export class TelemetryCollector {
  private metrics: Metric[] = [];
  private events: TelemetryEvent[] = [];

  // ── Record ───────────────────────────────────────────────

  recordMetric(name: string, value: number, tags: Record<string, string> = {}): void {
    this.metrics.push({
      metricId: `m:${nanoid(10)}`,
      name,
      value,
      tags,
      timestamp: new Date().toISOString(),
    });
  }

  recordEvent(type: string, details: Record<string, unknown> = {}): void {
    this.events.push({
      eventId: `ev:${nanoid(10)}`,
      type,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Query Metrics ────────────────────────────────────────

  getMetrics(name?: string, timeRange?: TimeRange): Metric[] {
    let results = [...this.metrics];

    if (name) {
      results = results.filter((m) => m.name === name);
    }
    if (timeRange) {
      results = results.filter(
        (m) => m.timestamp >= timeRange.since && m.timestamp <= timeRange.until,
      );
    }

    return results;
  }

  getMetricNames(): string[] {
    return [...new Set(this.metrics.map((m) => m.name))];
  }

  getLatestMetric(name: string): Metric | undefined {
    const matching = this.metrics.filter((m) => m.name === name);
    return matching.length > 0 ? matching[matching.length - 1] : undefined;
  }

  // ── Query Events ─────────────────────────────────────────

  getEvents(type?: string, limit?: number): TelemetryEvent[] {
    let results = [...this.events];

    if (type) {
      results = results.filter((e) => e.type === type);
    }

    // Most recent first
    results.reverse();

    if (limit !== undefined) {
      results = results.slice(0, limit);
    }

    return results;
  }

  getEventTypes(): string[] {
    return [...new Set(this.events.map((e) => e.type))];
  }

  // ── Utilities ────────────────────────────────────────────

  clear(): void {
    this.metrics = [];
    this.events = [];
  }

  metricCount(): number {
    return this.metrics.length;
  }

  eventCount(): number {
    return this.events.length;
  }
}
