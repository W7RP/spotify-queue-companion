import './queue-companion-pairing.js';
import './queue-companion.js';
export function load() { return () => window.__queueCompanion?.dispose(); }
