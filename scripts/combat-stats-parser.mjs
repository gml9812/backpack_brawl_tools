function decodeHtml(value = '') {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '-', mdash: '-' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, token) => {
    if (token[0] === '#') {
      const hexadecimal = token[1].toLowerCase() === 'x';
      return String.fromCodePoint(Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
    }
    return named[token.toLowerCase()] ?? '&' + token + ';';
  });
}

export function htmlToText(value = '') {
  return decodeHtml(value
    .replace(/<img[^>]+(?:alt|title)="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?\s*>/gi, '. ')
    .replace(/<\/(?:p|li|ul|ol|div)>/gi, '. ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/:\s*\./g, ':')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.\s*|\.\s*$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function parseCombatStats(html) {
  const priceMatch = html.match(/item-detail-price[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i);
  const baseStats = [];
  const statPattern = /<span class="block text-xs uppercase tracking-wide text-gray-500">([\s\S]*?)<\/span>\s*<strong>([\s\S]*?)<\/strong>/gi;
  for (const match of html.matchAll(statPattern)) {
    const label = htmlToText(match[1]);
    const value = htmlToText(match[2]);
    if (label && value) baseStats.push({ label, value });
  }

  const effects = unique([...html.matchAll(/<div class="game-effect">([\s\S]*?)<\/div>/gi)]
    .map((match) => htmlToText(match[1])));

  const levels = [];
  const levelsMarker = html.search(/<h2[^>]*>Levels<\/h2>/i);
  if (levelsMarker >= 0) {
    const levelsEnd = html.indexOf('</section>', levelsMarker);
    const levelsHtml = html.slice(levelsMarker, levelsEnd >= 0 ? levelsEnd : html.length);
    for (const row of levelsHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => htmlToText(cell[1]));
      if (cells.length < 4 || !/^\d+$/.test(cells[0])) continue;
      levels.push({
        level: Number(cells[0]),
        cards: cells[1],
        coins: cells[2],
        upgrade: cells.slice(3).join(' ').trim()
      });
    }
  }

  return {
    price: priceMatch ? htmlToText(priceMatch[1]) : '',
    baseStats,
    effects,
    levels
  };
}
