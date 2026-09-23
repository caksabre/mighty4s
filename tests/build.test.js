import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('standalone build retains valid JavaScript and embeds all runtime assets',()=>{
 execFileSync(process.execPath,['scripts/build.mjs']);
 const html=readFileSync('dist/index.html','utf8');
 const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code);assert.ok(code.includes('$$=s=>'));
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:code,encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);
 assert.ok(!/^import /m.test(code));assert.ok(!/<script[^>]+src=/.test(html));assert.ok(!/<link[^>]+stylesheet/.test(html));assert.ok(html.includes('data:image/jpeg;base64,'));
});
