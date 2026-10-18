// Explicitly enabled, device-local records. No tokens, passwords or request bodies are stored.
(function () {
  let dbPromise, enabled = false;
  function db() {
    return dbPromise ||= new Promise((resolve,reject)=>{
      const r=indexedDB.open('triage-private-cases',1);
      r.onupgradeneeded=()=>{r.result.createObjectStore('journal',{keyPath:'id'});r.result.createObjectStore('cases',{keyPath:'id'});};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>{dbPromise=null;reject(Error('Local storage unavailable; no action was sent'));};
    });
  }
  async function transaction(store,operation) {
    const d=await db();return new Promise((resolve,reject)=>{
      const tx=d.transaction(store,'readwrite'); const request=operation(tx.objectStore(store));
      tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(Error('Local record could not be saved; check storage and action state before retrying'));
    });
  }
  window.TriageJournal={
    async enable(){await db();enabled=true;},
    disable(){enabled=false;},
    async append(record){if(!enabled)throw Error('Enable the local action journal before responding');return transaction('journal',s=>s.put({id:crypto.randomUUID(),time:new Date().toISOString(),...record}));},
    // One record per case (keyed by caseId) plus a 'selected' pointer to the last save, so saving a
    // second case never silently overwrites the first.
    async save(bundle){const id=bundle?.evidence?.caseId;if(!id)throw Error('Bundle has no case ID');await transaction('cases',s=>s.put({id,bundle,savedAt:new Date().toISOString()}));return transaction('cases',s=>s.put({id:'selected',caseId:id}));},
    async open(caseId){const sel=caseId||(await transaction('cases',s=>s.get('selected')));const id=typeof sel==='string'?sel:sel?.caseId;if(!id)return (typeof sel==='object'?sel?.bundle:undefined);return (await transaction('cases',s=>s.get(id)))?.bundle;},
    async list(){return (await transaction('cases',s=>s.getAll())).filter(r=>r.bundle).map(r=>({caseId:r.id,savedAt:r.savedAt||'',tenantName:r.bundle.evidence?.tenantName||'',subject:r.bundle.evidence?.subject?.upn||'',scope:r.bundle.evidence?.scope||''}));},
    async remove(caseId){await transaction('cases',s=>s.delete(caseId));},
    async history(caseId){return (await transaction('journal',s=>s.getAll())).filter(r=>r.caseId===caseId);},
    async clear(){await transaction('cases',s=>s.clear());await transaction('journal',s=>s.clear());enabled=false;}
  };
})();
