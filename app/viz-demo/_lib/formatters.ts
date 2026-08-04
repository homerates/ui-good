export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatMonthYear(period: number): string {
  const years = Math.floor((period - 1) / 12);
  const months = ((period - 1) % 12) + 1;
  if (years === 0) return `Month ${months}`;
  return `Year ${years + 1}, Month ${months}`;
}
