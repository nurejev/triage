(function(){
  const workerUrl=new URL('case-worker.js',document.currentScript.src);
  const count=ev=>['signIns','ualRecords','directoryAudits','users','oauthGrants','riskDetections'].reduce((n,key)=>n+(ev[key]?.length||0),0);
  function run(evidence,mode,signal){
    if(signal?.aborted)return Promise.reject(new DOMException('Case changed','AbortError'));
    return new Promise((resolve,reject)=>{
      let worker;try{worker=new Worker(workerUrl);}catch(e){reject(Error('Background analysis unavailable. Use a smaller evidence package.'));return;}
      const end=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
      const abort=()=>{end();reject(new DOMException('Case changed','AbortError'));};signal?.addEventListener('abort',abort,{once:true});
      worker.onmessage=e=>{end();e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};worker.onerror=()=>{end();reject(Error('Background analysis failed. Retain the original package and reduce its size.'));};
      try{worker.postMessage({evidence,mode});}catch(e){end();reject(e);}
    });
  }
  window.TriageAnalysis={count,run};
})();
