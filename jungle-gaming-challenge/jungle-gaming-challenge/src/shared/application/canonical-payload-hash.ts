import { createHash } from 'node:crypto';

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const properties = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${properties.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

export function canonicalPayloadHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
