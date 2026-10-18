'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const GUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function deny(message, status=403) { throw Object.assign(Error(message),{status}); }
function authorize(cfg, caller, body, operation) {
  if(!GUID.test(body.caseId || '') || !GUID.test(body.objectId || '')) deny('Canonical case and mailbox IDs are required',400);
  if(body.tenantId !== cfg.tenantId || caller.tenantId !== cfg.tenantId) deny('Wrong case tenant');
  if(!cfg.allowedMailboxes.includes(body.objectId.toLowerCase()) || cfg.protectedIds.includes(body.objectId.toLowerCase())) deny('Mailbox outside approved scope');
  if(!cfg.allowedUsers.includes(caller.oid.toLowerCase())) deny('Analyst outside approved scope');
  if(!cfg.allowedOperations.includes(operation)) deny('Operation is not enabled');
  const mutation=/\/(remove|clear|disable)$/.test(operation);
  if(mutation && (!cfg.enableMutations || !caller.roles.includes('Triage.Responder'))) deny('Explicit responder role and enabled mutations required');
  if(!mutation && !caller.roles.some(r=>['Triage.Reader','Triage.Responder'].includes(r))) deny('Assigned reader role required');
  return {mutation};
}
// Exclusive creation binds a case to an owner; no browser-supplied role is trusted.
function bindCase(directory, caller, body) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,body.caseId.toLowerCase()+'.json');
  const owner={tenantId:caller.tenantId,owner:caller.oid};
  try { const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(owner));fs.fsyncSync(fd);}finally{fs.closeSync(fd);} }
  catch(e){if(e.code!=='EEXIST')throw e;const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(JSON.stringify(saved)!==JSON.stringify(owner))deny('Case belongs to another analyst');}
}
function audit(file, record) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const fd=fs.openSync(file,'a',0o600);
  try {fs.writeSync(fd,JSON.stringify({ts:new Date().toISOString(),...record})+'\n');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}
function reserve(directory, operationId, record) {
  if(!GUID.test(operationId||'')) deny('A valid operation ID is required',400);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  let fd;
  try {fd=fs.openSync(path.join(directory,operationId+'.json'),'wx',0o600);fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd);}
  catch(e){if(e.code==='EEXIST')deny('Operation already admitted. Verify its outcome before submitting another operation.',409);throw e;}
  finally {if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={authorize,bindCase,audit,reserve,GUID};
