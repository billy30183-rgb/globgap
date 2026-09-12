import picomatch from 'picomatch/posix.js';
import engine from 'picomatch/package.json' with { type: 'json' };
import { expandPattern, parseProvided, LIMITS } from './validation.js';
import { generate, shorterFirst } from './generate.js';

export const ENGINE_VERSION = engine.version;
export function matcherOptions(options = {}) {
  return { dot: options.dot === true, nocase: options.nocase === true, basename: false, windows: false, nonegate: true, noext: true, nobrace: true, regex: false, keepQuotes: true, strictSlashes: true, fastpaths: false };
}
export function createMatcher(expanded, options) {
  // Brace alternatives are expanded by our restricted grammar. Escape literal
  // regex/quote characters so Picomatch cannot enable syntax outside that grammar.
  return picomatch(expanded.map(p => p.replace(/[+^$|"']/g, c => '\\' + c)), matcherOptions(options));
}
export function classify(before, after) { return before ? (after ? 'UNCHANGED' : 'REMOVED') : (after ? 'ADDED' : 'UNMATCHED'); }
export function analyze(input, budget = LIMITS.generated) {
  const before = expandPattern(input.before), after = expandPattern(input.after);
  const provided = parseProvided(input.provided);
  const generated = generate(before, after, budget);
  const options = matcherOptions(input.options);
  const matchBefore = createMatcher(before, options), matchAfter = createMatcher(after, options);
  const rows = [];
  for (const [source, paths] of [['Generated example', generated.paths], ['Provided path', provided.paths]]) {
    for (const path of paths) {
      const b = matchBefore(path), a = matchAfter(path);
      rows.push({ path, source, before: b, after: a, kind: classify(b, a) });
    }
  }
  rows.sort((a, b) => shorterFirst(a.path, b.path) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  const counts = Object.fromEntries(['ADDED', 'REMOVED', 'UNCHANGED', 'UNMATCHED'].map(k => [k, rows.filter(r => r.kind === k).length]));
  return { before: input.before, after: input.after, options, engine: ENGINE_VERSION, rows, counts, generated: generated.paths.length, provided: provided.paths.length, duplicates: provided.duplicates, budget, incomplete: generated.truncated || generated.tooLong, reasons: [generated.truncated && 'Candidate limit reached; generation is incomplete.', generated.tooLong && 'Some generated paths exceeded 512 characters and were not checked.'].filter(Boolean) };
}
export const LIMITATION = 'This is a bounded search, not a proof of equivalence.';
export const NO_DIFFERENCES = 'No differences found among the checked paths.';
