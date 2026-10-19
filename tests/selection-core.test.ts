import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateSelectionCore} from '../scripts/sync-selection-core.mjs';

test('one canonical prompt edit reaches desktop, mobile and C# and stale artifacts fail closed',()=>{
  const sandbox=mkdtempSync(join(tmpdir(),'qc-selection-core-'));
  try {
    cpSync(new URL('../selection-core',import.meta.url),join(sandbox,'selection-core'),{recursive:true});
    const first=generateSelectionCore(sandbox);
    generateSelectionCore(sandbox,true);
    // The standalone check resolves its app from scripts/, just like a Site export.
    cpSync(new URL('../mobile/scripts',import.meta.url),join(sandbox,'mobile/scripts'),{recursive:true});
    const verifyMobile=()=>spawnSync(process.execPath,[join(sandbox,'mobile/scripts/check-selection-core.mjs')],{encoding:'utf8'}).status;
    assert.equal(verifyMobile(),0);
    appendFileSync(join(sandbox,'mobile/lib/queue/curation.ts'),'// manual mobile edit\n');
    assert.notEqual(verifyMobile(),0);
    generateSelectionCore(sandbox);
    appendFileSync(join(sandbox,'selection-core/prompts/curation.txt'),'Always preserve this test music constraint.\n');
    assert.throws(()=>generateSelectionCore(sandbox,true),/outputs are stale/);
    const next=generateSelectionCore(sandbox);assert.notEqual(next.fingerprint,first.fingerprint);
    for(const file of ['extension/src/curation.ts','mobile/lib/queue/curation.ts','helper/SelectionPolicy.g.cs'])assert(readFileSync(join(sandbox,file),'utf8').includes('Always preserve this test music constraint.'));
    assert.equal(readFileSync(join(sandbox,'extension/src/curation.ts'),'utf8'),readFileSync(join(sandbox,'mobile/lib/queue/curation.ts'),'utf8'));
    assert.equal(generateSelectionCore(sandbox,true).fingerprint,next.fingerprint);
    const policyPath=join(sandbox,'selection-core/policy.json'),policy=JSON.parse(readFileSync(policyPath,'utf8'));
    policy.defaults.artistShareDivisor=10;writeFileSync(policyPath,JSON.stringify(policy));
    generateSelectionCore(sandbox);
    for(const file of ['extension/src/curation.ts','mobile/lib/queue/curation.ts','helper/SelectionPolicy.g.cs'])assert(readFileSync(join(sandbox,file),'utf8').includes('one tenth'));
    assert.equal(verifyMobile(),0);
    appendFileSync(join(sandbox,'helper/SelectionPolicy.g.cs'),'// manual drift\n');
    assert.throws(()=>generateSelectionCore(sandbox,true),/SelectionPolicy.g.cs/);
  } finally {
    if(!resolve(sandbox).startsWith(join(tmpdir(),'qc-selection-core-')))throw Error('Invalid fixture cleanup path');
    rmSync(sandbox,{recursive:true});
  }
});
