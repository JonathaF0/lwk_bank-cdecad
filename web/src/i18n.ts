import en from '../../locales/en.json';

/* UI strings come from locales/<code>.json -> "ui". The server sends the active
 * language with the bank data; anything missing falls back to the bundled English,
 * then to the key itself. Placeholders look like {name}. */

export type Strings = Record<string, string>;
export type T = (key: string, vars?: Record<string, string | number>) => string;

const FALLBACK: Strings = en.ui;

export function makeT(strings?: Strings): T {
  const s = { ...FALLBACK, ...(strings ?? {}) };
  return (key, vars) => {
    let out = s[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  };
}
