import { LIMITATION, NO_DIFFERENCES } from './compare.js';
// Encode punctuation rather than permitting Markdown/HTML structure from input.
export const escapeMarkdown = value => Array.from(String(value), c => /[\p{L}\p{N}/]/u.test(c) ? c : `&#${c.codePointAt(0)};`).join('');
export function report(result) {
  const lines = ['# GlobGap report', '', 'See what your glob change actually changes.', '', `Before: ${escapeMarkdown(result.before)}`, `After: ${escapeMarkdown(result.after)}`, '', `Engine: Picomatch ${result.engine} (POSIX entry)`, `Options: ${escapeMarkdown(JSON.stringify(result.options))}`, '', `Checked ${result.generated} generated examples and ${result.provided} unique provided paths. ${result.duplicates} duplicate provided lines removed.`, `Generation budget: ${result.budget}.`, `Status: ${result.incomplete ? 'Incomplete: ' + result.reasons.join(' ') : 'Completed within the configured finite search.'}`, '', `ADDED: ${result.counts.ADDED}; REMOVED: ${result.counts.REMOVED}; UNCHANGED: ${result.counts.UNCHANGED}; UNMATCHED: ${result.counts.UNMATCHED}.`, ''];
  if (!result.counts.ADDED && !result.counts.REMOVED) lines.push(NO_DIFFERENCES, '');
  lines.push(LIMITATION, 'Generated examples are synthetic paths, not files known to exist in a project.', 'Examples are sorted by length then code-unit order; these are shorter examples found, not globally shortest witnesses.', 'Picomatch semantics may differ from Git, Docker, Bash, GitHub Actions or other tools.', '', '| Result | Source | Path |', '| --- | --- | --- |');
  for (const row of result.rows) lines.push(`| ${row.kind} | ${row.source} | ${escapeMarkdown(row.path)} |`);
  return lines.join('\n') + '\n';
}
