function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapPartName(name: string, maxChars = 16): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Placeholder foto netral bertuliskan nama resmi part saat foto asli belum tersedia.
 */
export function createPartPlaceholder(partName: string): string {
  const lines = wrapPartName(partName, 16);
  const startY = 82 - (lines.length - 1) * 7;
  const textSpans = lines
    .map(
      (line, idx) =>
        `<tspan x="80" y="${startY + idx * 15}">${escapeXml(line)}</tspan>`
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="8" fill="#F4F4F5"/>
  <rect x="0.5" y="0.5" width="159" height="159" rx="7.5" fill="none" stroke="#E4E4E7"/>
  <text x="80" y="46" text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#71717A">Foto belum ada</text>
  <text text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#27272A">${textSpans}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
