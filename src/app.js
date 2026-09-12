import { createJobs } from './jobs.js';
import { report } from './report.js';
import { ENGINE_VERSION, matcherOptions } from './compare.js';
import { demos } from './demos.js';
import workerSource from 'globgap:worker-source';
const workerURL = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
const $ = id => document.getElementById(id);
let result;
function clear() {
  result = undefined; $('copy').disabled = true; $('summary').textContent = '';
  for (const id of ['added', 'removed', 'others']) $(id).replaceChildren();
  for (const id of ['added-count', 'removed-count']) $(id).textContent = '0';
  $('no-differences').hidden = true; $('report-preview').hidden = true; $('report-text').value = '';
  $('others-summary').textContent = 'Other checked paths';
}
function state(message) { $('status').textContent = message; const busy = message === 'Searching…'; $('cancel').disabled = !busy; $('results').setAttribute('aria-busy', String(busy)); }
function render(data) {
  result = data;
  state(data.incomplete ? 'Incomplete search. ' + data.reasons.join(' ') : 'Comparison complete within the configured finite search.');
  $('summary').textContent = `${data.generated} generated examples · ${data.provided} unique provided paths · ${data.duplicates} duplicate lines removed`;
  $('added-count').textContent = data.counts.ADDED; $('removed-count').textContent = data.counts.REMOVED;
  $('others-summary').textContent = `Other checked paths — ${data.counts.UNCHANGED} UNCHANGED · ${data.counts.UNMATCHED} UNMATCHED`;
  $('no-differences').hidden = Boolean(data.counts.ADDED || data.counts.REMOVED);
  for (const row of data.rows) {
    const li = document.createElement('li'), path = document.createElement('code'), source = document.createElement('small');
    path.textContent = row.path; source.textContent = row.source + (['UNCHANGED', 'UNMATCHED'].includes(row.kind) ? ' · ' + row.kind : '');
    li.dataset.kind = row.kind; li.append(path, source);
    $(row.kind === 'ADDED' ? 'added' : row.kind === 'REMOVED' ? 'removed' : 'others').append(li);
  }
  $('copy').disabled = false;
}
const jobs = createJobs({ makeWorker: () => new Worker(workerURL, { type: 'module' }), onResult: render, onError: message => { clear(); state(message); }, onState: state });
function run() { clear(); jobs.run({ before: $('before').value, after: $('after').value, provided: $('provided').value, options: { dot: $('dot').checked, nocase: $('nocase').checked } }); }
function loadDemo(key) {
  if (!Object.hasOwn(demos, key)) return;
  const demo = demos[key];
  $('before').value = demo.before; $('after').value = demo.after; $('provided').value = '';
  $('dot').checked = false; $('nocase').checked = false;
  for (const button of $('demos').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.demo === key));
  run();
}
for (const [key, demo] of Object.entries(demos)) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = demo.label; button.dataset.demo = key;
  button.addEventListener('click', () => { history.replaceState(null, '', '#demo=' + key); loadDemo(key); }); $('demos').append(button);
}
$('compare-form').addEventListener('submit', event => { event.preventDefault(); run(); });
for (const id of ['before', 'after', 'provided', 'dot', 'nocase']) $(id).addEventListener('input', () => {
  jobs.cancel(); clear(); state('Inputs changed. Find differences to compare.');
  for (const button of $('demos').querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
});
$('cancel').addEventListener('click', () => { jobs.cancel(); clear(); });
$('copy').addEventListener('click', async () => {
  if (!result) return;
  const snapshot = result, markdown = report(snapshot);
  $('report-text').value = markdown; $('report-preview').hidden = false;
  try { await navigator.clipboard.writeText(markdown); if (result === snapshot) state('Markdown report copied. Review private paths before sharing.'); }
  catch { if (result === snapshot) { $('report-preview').open = true; $('report-text').focus(); $('report-text').select(); state('Clipboard unavailable. Copy the report from the preview. Review private paths before sharing.'); } }
});
$('engine').textContent = `Picomatch ${ENGINE_VERSION} · POSIX · Case-sensitive and dotfiles excluded by default.`;
$('options').textContent = 'Fixed engine defaults: ' + JSON.stringify(matcherOptions());
window.addEventListener('hashchange', () => loadDemo(new URLSearchParams(location.hash.slice(1)).get('demo')));
const initialDemo = new URLSearchParams(location.hash.slice(1)).get('demo');
loadDemo(Object.hasOwn(demos, initialDemo) ? initialDemo : 'nested');
