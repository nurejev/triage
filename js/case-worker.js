// Receives evidence only. No authentication or execution services are loaded.
self.window=self;
importScripts('../BETA/js/evidence.js','../BETA/js/blacklists.js','../BETA/js/analyzers.js','../BETA/js/exchange-analysis.js','detections.js');
self.onmessage=event=>{try{const {mode,evidence}=event.data;self.postMessage({result:mode==='tenant'?BETA_Analyzers.analyze(evidence):TriageDetections.analyze(evidence)});}catch(e){self.postMessage({error:e.message});}};
