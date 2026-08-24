/** How long something has been waiting, in the terms a person would say it. */
export function waitingAge(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** Anything sitting longer than this gets flagged in a queue. */
export function isStale(iso: string, hours = 2): boolean {
  return Date.now() - new Date(iso).getTime() > hours * 3600_000;
}

export function sealLabel(seal: { unitCode: string | null; unitName: string; level: string } | null): string {
  if (!seal) return '';
  const unit = seal.unitCode || seal.unitName;
  const level = seal.level.charAt(0) + seal.level.slice(1).toLowerCase();
  return `${unit} · ${level}`;
}
