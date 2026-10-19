import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const lock=JSON.parse(readFileSync(new URL('selection-core.lock.json',root),'utf8'));
const source=readFileSync(new URL('lib/queue/curation.ts',root),'utf8').replace(/\r\n/g,'\n');
if(lock.schemaVersion!==1||createHash('sha256').update(source).digest('hex')!==lock.generatedHash||!source.includes(lock.sourceHash))throw Error('The shared selection core was modified or exported incompletely. Regenerate it from selection-core/ in the main repository before building this Site.');
console.log(`Selection core ${lock.version}: verified (${lock.sourceHash.slice(0,12)})`);
