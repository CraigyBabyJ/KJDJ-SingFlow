export const toTitleCase = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      // Preserve catalog codes or tokens with digits in uppercase (e.g., AMS1041-08).
      if (/\d/.test(word)) return word.toUpperCase();
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

export const isVocalTrack = (song) => {
  if (!song) return false;
  const haystack = [song.title, song.artist, song.file_path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes('vocal');
};
