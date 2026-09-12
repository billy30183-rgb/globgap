import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createJobs } from '../src/jobs.js';
function setup(timeout = 1000) {
  const workers = [], results = [], states = [], errors = [];
  const jobs = createJobs({ timeout, makeWorker: () => { const w = { terminate() { this.terminated = true; }, postMessage(data) { this.data = data; } }; workers.push(w); return w; }, onResult: r => results.push(r), onState: s => states.push(s), onError: e => errors.push(e) });
  return { jobs, workers, results, states, errors };
}
test('cancel terminates Worker and rejects late replies', () => {
  const x = setup(); x.jobs.run({}); const w = x.workers[0]; x.jobs.cancel();
  w.onmessage({ data: { id: w.data.id, result: 'stale' } });
  assert.equal(w.terminated, true); assert.deepEqual(x.results, []); assert.match(x.states.at(-1), /incomplete/);
});
test('new job cancels old Worker and only accepts its own id', () => {
  const x = setup(); x.jobs.run({}); x.jobs.run({});
  const [old, next] = x.workers; assert.ok(old.terminated);
  old.onmessage({ data: { id: old.data.id, result: 'old' } });
  next.onmessage({ data: { id: old.data.id, result: 'wrong id' } });
  next.onmessage({ data: { id: next.data.id, result: 'new' } });
  assert.deepEqual(x.results, ['new']); assert.ok(next.terminated);
});
test('timeout terminates Worker, marks incomplete and ignores stale results', async () => {
  const x = setup(10); x.jobs.run({}); await delay(30);
  assert.ok(x.workers[0].terminated); assert.match(x.states.at(-1), /Timed out.*incomplete/);
  x.workers[0].onmessage({ data: { id: x.workers[0].data.id, result: 'late' } }); assert.deepEqual(x.results, []);
});
test('Worker failures are surfaced', () => {
  const x = setup(); x.jobs.run({}); x.workers[0].onerror(); assert.match(x.errors[0], /incomplete/);
  x.jobs.run({}); const w = x.workers[1]; w.onmessage({ data: { id: w.data.id, error: 'Invalid pattern' } }); assert.equal(x.errors.at(-1), 'Invalid pattern');
});
