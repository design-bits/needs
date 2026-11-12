// The needs note in a PR body: its markers, the ticks a person left in it, and swapping the note in place.

export const NOTE_START = '<!-- designbits:needs:start -->';
export const NOTE_END = '<!-- designbits:needs:end -->';

const LINE = /^\s*[-*]\s*\[( |x|X)\]\s.*<!--\s*need:([A-Za-z0-9_-]+)\s*-->/;

// [{ key, checked }] from the lines that carry a need marker; other checkboxes are ignored
export const parseTicks = body => String(body || '').split(/\r?\n/).flatMap(l => {
  const m = LINE.exec(l);
  return m ? [{ key: m[2], checked: m[1].toLowerCase() === 'x' }] : [];
});

// the note without its markers, whether or not the server sent them
const inner = note => {
  const t = String(note || '').trim();
  return t.startsWith(NOTE_START) && t.endsWith(NOTE_END) ? t.slice(NOTE_START.length, -NOTE_END.length).trim() : t;
};

// swaps what is between the markers, or appends the block; the rest of the body is untouched
export function replaceNote(body, note) {
  const text = String(body || ''), block = `${NOTE_START}\n${inner(note)}\n${NOTE_END}`;
  const a = text.indexOf(NOTE_START), b = text.indexOf(NOTE_END, a + 1);
  if (a >= 0 && b > a) return text.slice(0, a) + block + text.slice(b + NOTE_END.length);
  return text.trim() ? `${text.replace(/\s+$/, '')}\n\n${block}\n` : `${block}\n`;
}
