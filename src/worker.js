import { analyze } from './compare.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: analyze(data.input) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
