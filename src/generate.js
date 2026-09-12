import { LIMITS, validatePath } from './validation.js';

export const shorterFirst = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Finite, deterministic templates. Literal vocabulary is taken from BOTH inputs.
// This generates witnesses, never classification decisions.
export function generate(before, after, budget = LIMITS.generated) {
  if (!Number.isInteger(budget) || budget < 1 || budget > LIMITS.generated) throw new Error('Invalid generation budget.');
  const patterns = [...before, ...after];
  const fragments = [...new Set(patterns.flatMap(p => p.split(/[/*?.]+/).filter(Boolean)))].sort(shorterFirst);
  const dirs = [...new Set(patterns.flatMap(p => p.split('/').slice(0, -1).filter(s => !/[?*]/.test(s))))];
  const extensions = [...new Set([...patterns.flatMap(p => [...p.matchAll(/\.([^/*?.]+)(?=\/|$)/g)].map(m => m[1])), 'txt', 'js', 'ts', 'md'])];
  const words = [...new Set(['', 'a', 'ab', 'long-name', 'main', 'app', 'con', 'readme', '.hidden', '名 字', ...fragments])];
  const depths = ['', 'lib', 'lib/deep', '.hidden', '.hidden/deep', ...dirs];
  const seen = new Set(); let truncated = false, tooLong = false;
  const stop = Symbol('candidate limit');
  function add(path) {
    if (path.length > LIMITS.path) { tooLong = true; return; }
    try { validatePath(path); } catch { return; }
    if (seen.has(path)) return;
    if (seen.size >= budget) { truncated = true; throw stop; }
    seen.add(path);
  }
  function synth(pattern, word, depth, varying = -1, replacement = '') {
    let index = 0;
    return pattern.split('/').flatMap(segment => {
      if (segment === '**') { const v = index++ === varying ? replacement : depth; return v ? v.split('/') : []; }
      return [segment.replace(/\*|\?/g, token => {
        const value = index++ === varying ? replacement : word;
        return token === '?' ? (Array.from(value)[0] || 'a') : value;
      })];
    }).join('/');
  }
  try {
  // Round-robin across both patterns and brace branches so neither input monopolizes the budget.
  for (const word of words) for (const depth of depths) for (const p of patterns) add(synth(p, word, depth));
  for (const p of patterns) {
    const tokens = p.match(/\*\*|\*|\?/g) || [];
    tokens.forEach((token, i) => {
      for (const value of token === '**' ? depths : words) add(synth(p, 'a', 'lib', i, value));
    });
  }
  const seeds = [...seen];
  for (const path of seeds) {
    add(path.toUpperCase()); add(path.toLowerCase());
    const segments = path.split('/');
    for (let i = 0; i < segments.length; i++) {
      const next = [...segments]; next[i] = '.' + next[i]; add(next.join('/'));
    }
    for (const ext of extensions) add(path.replace(/\.[^/.]*$/, '') + '.' + ext);
  }
  for (const dir of ['', 'src', 'docs', ...dirs]) for (const name of ['a', 'main', '.env', '名 字']) for (const ext of ['', ...extensions.map(x => '.' + x)]) add([dir, name + ext].filter(Boolean).join('/'));
  } catch (error) { if (error !== stop) throw error; }
  return { paths: [...seen].sort(shorterFirst), truncated, tooLong, budget };
}
