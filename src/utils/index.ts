export function isAbsoluteWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

export function isPs2Platform(value: string): boolean {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return normalized === 'ps2' || normalized === 'ps 2' || normalized.includes('playstation 2');
}

export function detectLinkType(urlOrPath: string): 'drive' | 'mega' | 'local' | 'other' {
  if (isAbsoluteWindowsPath(urlOrPath.trim())) return 'local';
  if (urlOrPath.includes('drive.google.com')) return 'drive';
  if (urlOrPath.includes('mega.nz')) return 'mega';
  return 'other';
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function getLinkIcon(linkType: 'drive' | 'mega' | 'local' | 'other'): string {
  switch (linkType) {
    case 'drive': return '📁';
    case 'mega': return '☁️';
    case 'local': return '🖥️';
    default: return '🔗';
  }
}

export * from './logger';
