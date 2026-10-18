// Verify packaged code identity, not live Microsoft behavior.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {extractFile} from '@electron/asar';
const root=path.resolve(import.meta.dirname,'..');
for(const target of ['darwin-arm64','win32-x64']){
 const resource=path.join(root,'desktop/out','Triage-'+target,target.startsWith('darwin')?'Triage.app/Contents/Resources':'resources');
 const archive=path.join(resource,'app.asar');
 assert.equal(JSON.parse(extractFile(archive,'package.json')).version,'0.30.0');
 for(const name of ['main.cjs','preload.cjs','core.cjs','profiles.cjs','response.cjs']) assert.deepEqual(extractFile(archive,name),fs.readFileSync(path.join(root,'desktop',name)),target+': '+name);
 for(const dir of ['BETA/js','js'])for(const name of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.js')))assert.deepEqual(fs.readFileSync(path.join(resource,'site',dir,name)),fs.readFileSync(path.join(root,dir,name)),target+': '+dir+'/'+name);
 for(const name of fs.readdirSync(path.join(root,'desktop/collector')).filter(n=>n.endsWith('.ps1')))assert.deepEqual(fs.readFileSync(path.join(resource,'collector',name)),fs.readFileSync(path.join(root,'desktop/collector',name)),target+': '+name);
 assert.deepEqual(fs.readFileSync(path.join(resource,'site/BETA/index.html')),fs.readFileSync(path.join(root,'BETA/index.html')));
 assert.match(fs.readFileSync(path.join(resource,'site/BETA/index.html'),'utf8'),/BETA 30/);
 assert.match(fs.readFileSync(path.join(resource,'site/BETA/js/build.js'),'utf8'),/BETA_BUILD = 30/);
 assert.ok(fs.existsSync(path.join(resource,'runtime/modules/Az.Accounts/5.3.3/Az.Accounts.psd1')));
 console.log(target+': 0.30.0 / Beta 30; packaged JavaScript, PowerShell and runtime identity passed');
}
