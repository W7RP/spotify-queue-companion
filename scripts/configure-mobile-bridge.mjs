// Operator setup: receive service and computer credentials through hidden stdin,
// then send them directly to the helper's DPAPI-protected configuration command.
import { spawn } from 'node:child_process';
const helper = process.argv[2];
if (!helper) throw Error('Pass the absolute path to QueueCompanion.exe.');
const input = await new Promise((resolve, reject) => {
  let text = ''; const terminal = process.stdin.isTTY;
  function finish() { if (terminal) process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', read); resolve(text.trim()); }
  function read(chunk) { text += chunk; if (text.length > 12_000 || text.includes('\u0003')) { if (terminal) process.stdin.setRawMode(false); reject(Error('Configuration cancelled.')); return; } if (text.includes('\n') || text.includes('\r')) finish(); }
  if (terminal) process.stdin.setRawMode(true);
  process.stderr.write('Ready for computer configuration JSON on stdin (input is hidden).\n');
  process.stdin.setEncoding('utf8'); process.stdin.on('data', read); process.stdin.once('end', finish); process.stdin.resume();
});
JSON.parse(input);
const child = spawn(helper, ['--configure-mobile-bridge'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
child.stdin.end(input + '\n');
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
if (code !== 0) throw Error('The helper could not save computer configuration.');
console.log('Computer configuration saved in protected local storage. Restart the helper to connect.');
