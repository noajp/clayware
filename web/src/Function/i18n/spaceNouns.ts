// What a Space calls the three things Clayware is built from.
//
// A Space may name Strategy, Object and Element in its own words (Object →
// "Project", Element → "タスク"). The product's text writes these as
// capitalised English nouns in every language, so the names are put in
// where the text is translated: every label, heading and sentence that goes
// through `t` reads the Space's word, with no screen knowing about it.
//
// Only the message text is renamed, before its values are filled in: a
// name someone typed, an id or a URL passed as a value is never touched, and
// nothing here reaches the data or what is sent to AI.
//
// Pure, so the same rules hold on every surface and in tests.

export type NounKey = 'strategy' | 'strategies' | 'object' | 'objects' | 'element' | 'elements';
/** A Space's names, as stored: any may be missing, meaning the built-in one. */
export type SpaceNouns = Partial<Record<NounKey, string>>;

export const NOUN_KINDS = [
  { singular: 'strategy', plural: 'strategies', one: 'Strategy', many: 'Strategies' },
  { singular: 'object', plural: 'objects', one: 'Object', many: 'Objects' },
  { singular: 'element', plural: 'elements', one: 'Element', many: 'Elements' },
] as const;

/** The longest name a Space may give (the database holds it to the same). */
export const MAX_NOUN = 40;

const CJK = /[　-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/;

/** Pure. The plural a name takes when the Space gave none: English-looking
 *  names get an English plural, any other script stays as it is. */
export function pluralOf(name: string): string {
  const n = name.trim();
  if (!n || !/^[A-Za-z][A-Za-z0-9 '\-]*$/.test(n)) return n;
  if (/[^aeiou]y$/i.test(n)) return `${n.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(n)) return `${n}es`;
  return `${n}s`;
}

/** Pure. The words to put in place of the built-in nouns, or null when the
 *  Space keeps them all. A plural left empty follows from the singular; a
 *  singular left empty takes the plural only where the script has none. */
export function nounTable(nouns: SpaceNouns | null | undefined): Record<string, string> | null {
  if (!nouns) return null;
  const table: Record<string, string> = {};
  for (const k of NOUN_KINDS) {
    const one = (nouns[k.singular] ?? '').trim().slice(0, MAX_NOUN);
    const many = (nouns[k.plural] ?? '').trim().slice(0, MAX_NOUN);
    const singular = one || (many && CJK.test(many) ? many : '');
    const plural = many || (one ? pluralOf(one) : '');
    if (singular && singular !== k.one) table[k.one] = singular;
    if (plural && plural !== k.many) table[k.many] = plural;
  }
  return Object.keys(table).length ? table : null;
}

const NOUN = /\b(Strategies|Strategy|Objects|Object|Elements|Element)\b/g;
const VOWEL_SOUND = /^[aeiou]/i;

/** Pure. A message with the built-in nouns given the Space's names.
 *  In Japanese the spaces set around an English noun go where the name is
 *  written in Japanese; in English "a"/"an" follows the new word. */
export function renameNouns(message: string, table: Record<string, string> | null, locale: string): string {
  if (!table || !message) return message;
  let out = '';
  let last = 0;
  NOUN.lastIndex = 0;
  for (let m = NOUN.exec(message); m; m = NOUN.exec(message)) {
    const word = table[m[1]];
    if (!word) continue;
    let head = message.slice(last, m.index);
    let tailSkip = 0;
    if (locale === 'ja') {
      // "この Object に" → "このプロジェクトに" when the name is Japanese.
      if (CJK.test(word[0]) && /[^\S\n]$/.test(head) && CJK.test(head.slice(-2, -1))) head = head.slice(0, -1);
      const after = message.slice(m.index + m[1].length, m.index + m[1].length + 2);
      if (CJK.test(word[word.length - 1]) && /^[^\S\n]/.test(after) && CJK.test(after.slice(1))) tailSkip = 1;
    } else if (locale === 'en') {
      head = head.replace(/\b(a|an|A|An)(\s+)$/, (_, art: string, sp: string) => {
        const an = VOWEL_SOUND.test(word);
        const fixed = an ? 'an' : 'a';
        return (art[0] === 'A' ? fixed[0].toUpperCase() + fixed.slice(1) : fixed) + sp;
      });
    }
    out += head + word;
    last = m.index + m[1].length + tailSkip;
  }
  return last === 0 ? message : out + message.slice(last);
}

/** Pure. Names as typed, made ready to store: trimmed, capped, empties left out. */
export function cleanNouns(nouns: SpaceNouns): SpaceNouns {
  const out: SpaceNouns = {};
  for (const k of NOUN_KINDS) {
    for (const key of [k.singular, k.plural] as const) {
      const v = (nouns[key] ?? '').trim().slice(0, MAX_NOUN);
      if (v) out[key] = v;
    }
  }
  return out;
}
