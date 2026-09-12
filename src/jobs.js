import { LIMITS } from './validation.js';
export function createJobs({ makeWorker, timeout = LIMITS.timeout, onResult, onError, onState }) {
  let current, serial = 0;
  function cancel(message = 'Cancelled. Results are incomplete; run a new comparison.') {
    serial++;
    if (!current) return;
    clearTimeout(current.timer); current.worker.terminate(); current = undefined;
    onState?.(message);
  }
  function run(input) {
    cancel(); const id = ++serial;
    try {
      const worker = makeWorker(); current = { worker };
      const finish = () => { clearTimeout(current.timer); worker.terminate(); current = undefined; };
      worker.onmessage = ({ data }) => {
        if (id !== serial || !current || data.id !== id) return;
        finish(); data.error ? onError(data.error) : onResult(data.result);
      };
      worker.onerror = () => { if (id !== serial || !current) return; finish(); onError('Worker failed. Results are incomplete; please retry.'); };
      current.timer = setTimeout(() => {
        if (id !== serial || !current) return;
        cancel('Timed out. Results are incomplete; simplify the patterns and retry.');
      }, timeout);
      onState?.('Searching…'); worker.postMessage({ id, input });
    } catch { cancel(); onError('Could not start the Worker. Results are incomplete.'); }
  }
  return { run, cancel };
}
