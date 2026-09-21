export const LIMITS = Object.freeze({ pattern: 256, path: 512, provided: 2000, generated: 3000, braces: 64, wildcards: 16, timeout: 4000 });

export function validatePath(path, max = LIMITS.path) {
  if (typeof path !== 'string' || !path.length) throw new Error('Empty paths are not accepted.');
  if (path.length > max) throw new Error(`Path exceeds ${max} characters.`);
  if (/[\x00-\x1f\x7f-\x9f]/u.test(path)) throw new Error('Control characters are not accepted.');
  if (path.includes('\\')) throw new Error('Use / as the path separator. Windows backslashes and escapes are not supported; paths are never rewritten.');
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new Error('Use a relative path, not an absolute or drive-qualified path.');
  if (path.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Use nonempty relative path segments without . or .. segments or a trailing slash.');
  return path;
}

export function expandPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.length) throw new Error('Enter both Before and After patterns.');
  if (pattern.length > LIMITS.pattern) throw new Error(`Each pattern is limited to ${LIMITS.pattern} characters.`);
  validatePath(pattern, LIMITS.pattern);
  if (/[!\[\]()]/.test(pattern)) throw new Error('Negation, extglobs, parentheses, character classes and ranges are not supported.');
  if ((pattern.match(/\*\*|\*|\?/g) || []).length > LIMITS.wildcards) throw new Error(`At most ${LIMITS.wildcards} wildcards are allowed per pattern.`);
  let parts = [''], inside = false, group = '', combinations = 1;
  for (const char of pattern) {
    if (char === '{') {
      if (inside) throw new Error('Nested braces are not supported.');
      inside = true; group = '';
    } else if (char === '}') {
      if (!inside) throw new Error('Unbalanced braces.');
      const choices = group.split(',');
      const range = /^(?:-?\d+\.\.-?\d+|[A-Za-z]\.\.[A-Za-z])(?:\.\.-?\d+)?$/;
      if (choices.length < 2 || choices.some(x => !x || range.test(x))) throw new Error('Braces require nonempty comma-separated alternatives; ranges are not supported.');
      combinations *= choices.length;
      if (combinations > LIMITS.braces) throw new Error(`Brace expansion exceeds ${LIMITS.braces} combinations.`);
      parts = parts.flatMap(p => choices.map(c => p + c)); inside = false;
    } else if (inside) group += char;
    else parts = parts.map(p => p + char);
  }
  if (inside) throw new Error('Unbalanced braces.');
  for (const p of parts) {
    validatePath(p, LIMITS.pattern);
    if (p.split('/').some(s => s.includes('**') && s !== '**')) throw new Error('** must be an entire path segment.');
  }
  return [...new Set(parts)];
}

export function parseProvided(text = '') {
  if (typeof text !== 'string') throw new Error('Provided paths must be text.');
  if (text.length > LIMITS.provided * (LIMITS.path + 2)) throw new Error('Provided path text exceeds the input limit.');
  if (!text) return { paths: [], duplicates: 0 };
  const lines = text.split(/\r\n|\n/);
  // A terminal newline is a line terminator, not an additional empty filename.
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > LIMITS.provided) throw new Error(`Provide at most ${LIMITS.provided} paths (including duplicates).`);
  lines.forEach((line, i) => { try { validatePath(line); } catch (error) { throw new Error(`Provided line ${i + 1}: ${error.message}`); } });
  const paths = [...new Set(lines)];
  return { paths, duplicates: lines.length - paths.length };
}
