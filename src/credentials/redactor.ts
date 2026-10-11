/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

/** This instance lives only in the trusted process. Never persist its secret set. */
export class SecretRedactor {
  private secrets = new Set<string>()
  add(secret: string) { if (secret) this.secrets.add(secret) }
  redact(text: string): string {
    let result = text
    const variants = [...this.secrets].flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)])
    for (const value of [...new Set(variants)].sort((a, b) => b.length - a.length)) result = result.split(value).join('[REDACTED]')
    return result.replace(/\b(Bearer|Basic)\s+[^\s,;"']+/gi, '$1 [REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED]')
  }
  contains(value: unknown): boolean {
    if (typeof value === 'string') return [...this.secrets].some(secret => secret.length < 8 ? value === secret : value.includes(secret) || value.includes(encodeURIComponent(secret)))
    if (Array.isArray(value)) return value.some(item => this.contains(item))
    if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => this.contains(key) || this.contains(item))
    return false
  }
}
