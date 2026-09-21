import { test } from 'node:test';
import assert from 'node:assert/strict';
import picomatch from 'picomatch/posix.js';
import { analyze, ENGINE_VERSION, matcherOptions, createMatcher } from '../src/compare.js';
import { expandPattern, parseProvided, validatePath, LIMITS } from '../src/validation.js';
import { generate } from '../src/generate.js';
import { report } from '../src/report.js';
import { demos } from '../src/demos.js';
const compare = (before, after, provided = '', options = {}) => analyze({ before, after, provided, options });
const kind = (r, p) => r.rows.find(row => row.path === p && row.source === 'Provided path')?.kind;

for (const [demo, cases] of [
  ['nested', [['src/main.ts', 'UNCHANGED'], ['src/lib/util.ts', 'REMOVED']]],
  ['typescript', [['src/main.js', 'UNCHANGED'], ['src/main.ts', 'ADDED']]],
  ['docs', [['docs/readme.md', 'UNCHANGED'], ['docs/guide/setup.md', 'REMOVED']]],
  ['tests', [['src/app.test.js', 'UNCHANGED'], ['src/contest.js', 'ADDED']]]
]) test(`demo ${demo}: real matching and generated differences without provided paths`, () => {
  const { before, after } = demos[demo];
  const r = compare(before, after, cases.map(x => x[0]).join('\n'));
  for (const [path, expected] of cases) assert.equal(kind(r, path), expected);
  const synthetic = compare(before, after);
  assert.ok(synthetic.rows.some(r => ['ADDED', 'REMOVED'].includes(r.kind)));
  assert.ok(synthetic.rows.every(r => r.source === 'Generated example'));
});

test('engine version and options are fixed; witnesses obey the independent engine', () => {
  assert.equal(ENGINE_VERSION, '4.0.7');
  for (const [before, after] of [...Object.values(demos).map(x => [x.before, x.after]), ['orchard/**/*.svelte', 'orchard/*.{vue,svelte}'], ['a/?x.*', '**/a*'], ['lib/*', 'assets/*']]) {
    for (const options of [{}, { dot: true, nocase: true }]) {
      const r = compare(before, after, '', options);
      const b = picomatch(before, { ...matcherOptions(options), nobrace: false });
      const a = picomatch(after, { ...matcherOptions(options), nobrace: false });
      for (const row of r.rows) {
        assert.equal(row.before, b(row.path)); assert.equal(row.after, a(row.path));
        if (row.kind === 'ADDED') assert.ok(!b(row.path) && a(row.path));
        if (row.kind === 'REMOVED') assert.ok(b(row.path) && !a(row.path));
      }
    }
  }
});
test('new literal vocabulary and arbitrary extensions drive generation', () => {
  const r = compare('orchard/**/*.svelte', 'orchard/*.svelte');
  assert.ok(r.rows.some(x => x.kind === 'REMOVED' && x.path.startsWith('orchard/') && x.path.endsWith('.svelte')));
  assert.ok(compare('zeta/*.mango', 'zeta/*.{mango,papaya}').counts.ADDED > 0);
});
test('?, brace alternatives and zero/one/multiple globstar depth', () => {
  const r = compare('x/?.{js,ts}', 'x/**/*.ts', 'x/a.js\nx/a.ts\nx/ab.ts\nx/lib/a.ts\nx/lib/deep/a.ts');
  assert.equal(kind(r, 'x/a.js'), 'REMOVED'); assert.equal(kind(r, 'x/a.ts'), 'UNCHANGED');
  for (const p of ['x/ab.ts', 'x/lib/a.ts', 'x/lib/deep/a.ts']) assert.equal(kind(r, p), 'ADDED');
  assert.equal(kind(compare('**/a', 'a', 'a\nx/a\nx/y/a'), 'x/y/a'), 'REMOVED');
});
test('same rules and disjoint rules', () => {
  const same = compare('a/**', 'a/**'); assert.equal(same.counts.ADDED + same.counts.REMOVED, 0);
  const disjoint = compare('kiwi/*.foo', 'mango/*.bar'); assert.ok(disjoint.counts.ADDED && disjoint.counts.REMOVED);
  const md = report(same); assert.match(md, /No differences found among the checked paths\./); assert.match(md, /bounded search, not a proof of equivalence/);
  assert.doesNotMatch(md, /Safe to merge|No files will be affected|\bEquivalent\b/);
});
test('dotfiles, explicit dot literals, case and full-path options', () => {
  for (const dot of [false, true]) {
    const r = compare('a', '**/*', '.env\n.hidden/a\nA\nsrc/a', { dot });
    assert.equal(kind(r, '.env'), dot ? 'ADDED' : 'UNMATCHED');
    assert.equal(kind(r, '.hidden/a'), dot ? 'ADDED' : 'UNMATCHED');
  }
  assert.equal(kind(compare('.env', '.env', '.env'), '.env'), 'UNCHANGED');
  assert.equal(kind(compare('a', 'A', 'a'), 'a'), 'REMOVED');
  assert.equal(kind(compare('a', 'A', 'a', { nocase: true }), 'a'), 'UNCHANGED');
  assert.equal(kind(compare('a', 'a', 'src/a'), 'src/a'), 'UNMATCHED');
});
test('unsupported syntax and invalid paths are rejected explicitly', () => {
  for (const pattern of ['', '!a', 'a/!(b)', 'a/+(b)', '[a-z]', '{a,{b,c}}', '{1..3}', '{a}', '{a,}', '{a,b', 'a}', 'foo/**bar', 'a***', 'a\\b', '/a', 'C:/a', 'a\nb', 'a\tb', 'a//b', '../x', 'a/', '{/,a}x']) assert.throws(() => expandPattern(pattern), undefined, pattern);
  for (const path of ['', '/a', 'C:a', 'a\\b', 'a\u0000b', 'a\u0085b', './a', 'a/../b']) assert.throws(() => validatePath(path), undefined, path);
  assert.throws(() => parseProvided('a\n\nb'), /line 2/);
  assert.throws(() => parseProvided('a\rb'), /Control/);
});
test('Unicode, spaces, duplicates and LF/CRLF are preserved', () => {
  const paths = parseProvided('a \r\n a\r\n化學/測 試.ts\r\na \r\n');
  assert.deepEqual(paths, { paths: ['a ', ' a', '化學/測 試.ts'], duplicates: 1 });
  const r = compare('化學/*.ts', '化學/*.ts', '化學/測 試.ts'); assert.equal(kind(r, '化學/測 試.ts'), 'UNCHANGED');
  assert.equal(kind(compare(' a ', ' a ', ' a '), ' a '), 'UNCHANGED');
  assert.equal(parseProvided('a\na').paths.length, 1);
});
test('all limits fail explicitly, generation budget marks incomplete', () => {
  assert.doesNotThrow(() => expandPattern('a'.repeat(256)));
  assert.throws(() => expandPattern('a'.repeat(257)), /256/);
  assert.doesNotThrow(() => validatePath('a'.repeat(512)));
  assert.throws(() => validatePath('a'.repeat(513)), /512/);
  assert.equal(parseProvided(Array(2000).fill('a').join('\n')).duplicates, 1999);
  assert.throws(() => parseProvided(Array(2001).fill('a').join('\n')), /2000/);
  assert.throws(() => expandPattern('{a,b}'.repeat(7)), /64/);
  assert.throws(() => expandPattern('?'.repeat(17)), /16/);
  assert.throws(() => generate(['a'], ['b'], 3001), /budget/);
  const limited = analyze({ before: '**/*.ts', after: '*.ts' }, 10);
  assert.equal(limited.generated, 10); assert.equal(limited.incomplete, true); assert.match(report(limited), /Incomplete/);
  assert.ok(compare('**/*.{a,b,c,d,e,f,g,h}', '**/*').generated <= LIMITS.generated);
});
test('generation order, budget and comparison are deterministic', () => {
  const input = { before: 'orchard/**/p?*.abc', after: '**/*.{abc,xyz}' };
  assert.deepEqual(analyze(input), analyze(input));
  const a = generate(expandPattern(input.before), expandPattern(input.after), 400);
  assert.deepEqual(a, generate(expandPattern(input.before), expandPattern(input.after), 400));
});
test('generation stops enumerating promptly at its candidate budget', { timeout: 2000 }, () => {
  const before = expandPattern(`root/{aa,bb}{cc,dd}{ee,ff}{gg,hh}{ii,jj}{kk,ll}/${'*?'.repeat(8)}.ext`);
  const after = expandPattern(`other/${'*?'.repeat(8)}.{${Array.from({ length: 64 }, (_, i) => String(i).padStart(2, '0')).join(',')}}`);
  const one = generate(before, after, 1);
  assert.equal(one.paths.length, 1); assert.equal(one.truncated, true);
  const bounded = generate(before, after, 3000);
  assert.equal(bounded.paths.length, 3000); assert.equal(bounded.truncated, true);
});
test('literal regex and quote punctuation has literal meaning', () => {
  for (const p of ['a+b', '^a$', 'a|b', 'a"b', "a'b", 'a.b', '<img src=x onerror=alert>']) {
    const matcher = createMatcher(expandPattern(p), {});
    assert.equal(matcher(p), true, p); assert.equal(matcher('other'), false);
  }
});
test('Markdown contains the same snapshot and safely encodes malicious names', () => {
  const p = 'x/`|<img src=x onerror=alert> & [link].md';
  const r = compare('*.txt', '**/*', p);
  const md = report(r);
  assert.doesNotMatch(md, /<img|\[link\]|`/); assert.match(md, /&#124;/); assert.match(md, /&#60;/);
  assert.equal(md.split('\n').filter(x => x.startsWith('| ')).length, r.rows.length + 2);
  assert.match(md, new RegExp(`ADDED: ${r.counts.ADDED}`));
  assert.match(md, /4\.0\.7/); assert.match(md, /Provided path/); assert.match(md, /Generated example/);
});

test('brace alternatives preserve literal repeated periods in filenames', () => {
  const r = compare('reports/file..old.txt', 'reports/{file..old,file..new}.txt', 'reports/file..old.txt\nreports/file..new.txt');
  assert.equal(kind(r, 'reports/file..old.txt'), 'UNCHANGED');
  assert.equal(kind(r, 'reports/file..new.txt'), 'ADDED');
  assert.ok(r.rows.some(row => row.source === 'Generated example' && row.path === 'reports/file..new.txt' && row.kind === 'ADDED'));
  for (const p of ['{1..3,x}.txt', '{a..z,x}.txt', '{-2..2..2,x}.txt']) assert.throws(() => expandPattern(p), /ranges/);
});
