// Offline review probes. No tenant access, credentials, or product mutations.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const results = [];
function record(name, reproduced, detail) { results.push({name,reproduced,detail}); }
function ctx(extra={}) {return vm.createContext({window:{},console,Date,URL,URLSearchParams,Buffer,setTimeout,clearTimeout,...extra});}
(async()=>{
 const c=ctx(); vm.runInContext(read('js/detections.js'),c);
 const row=(time,code,ip='192.0.2.1',upn='alice@example.test')=>({createdDateTime:time,status:{errorCode:code},ipAddress:ip,userPrincipalName:upn,clientAppUsed:'Browser',location:{countryOrRegion:'NL'}});
 const rows=[row('2026-09-01T08:00:00Z',0),...Array.from({length:10},(_,i)=>row(`2026-09-02T09:${String(i).padStart(2,'0')}:00Z`,50126))];
 let findings=c.window.TriageDetections.analyze({upn:'alice@example.test',signIns:rows});
 record('Success BEFORE failures is called an attack followed by success',findings.some(f=>/followed by/.test(f.Title)),findings.filter(f=>/followed by/.test(f.Title)).map(f=>f.Title));
 const hidden=row('2026-09-01T08:00:00Z',0);hidden.riskLevelDuringSignIn='hidden';
 findings=c.window.TriageDetections.analyze({upn:'alice@example.test',signIns:[hidden]});
 record('Hidden risk is scored as risky',findings.some(f=>/flagged as risky/.test(f.Title)),findings.map(f=>f.Title));
 findings=c.window.TriageDetections.analyze({upn:'alice@example.test',signIns:[row('2026-09-01T08:00:00Z',0),...rows.slice(1).map(r=>({...r,userPrincipalName:'bob@example.test'}))]});
 record('Mixed-user sign-ins become Alice Critical finding',findings.some(f=>f.Severity==='Critical'&&f.User==='alice@example.test'),findings.map(f=>({user:f.User,title:f.Title})));
 findings=c.window.TriageDetections.analyze({upn:'alice@example.test',directoryAudits:[{activityDisplayName:'Add member to role',activityDateTime:'2026-09-01T08:00:00Z',targetResources:[{id:'alice-id'}]}]});
 record('Directory audit evidence is not analyzed in main engine',findings.length===0,{findings:findings.length});
 findings=c.window.TriageDetections.analyze({upn:'alice@example.test',ualRecords:[{userPrincipalName:'alice@example.test',operation:'Set-Mailbox',auditData:{Parameters:[{Name:'ForwardingSmtpAddress',Value:null},{Name:'DeliverToMailboxAndForward',Value:false}]}}]});
 record('Removing forwarding is called Critical forwarding configured',findings.some(f=>f.Severity==='Critical'),findings.map(f=>f.Title));
 const bl=ctx();bl.window.TriageGraph={};bl.window.TRIAGE_AUTH={};vm.runInContext(read('js/blast.js'),bl);
 const mia=await bl.window.TriageBlast.checks.find(x=>x.key==='mailitems').run({target:{userPrincipalName:'alice@example.test'},days:90,demo:false,evidence:null});
 record('MailItemsAccessed returns zero without ever loading UAL',mia.count===0&&!mia.failed,{ualAvailable:bl.window.TriageBlast.ualAvailable({}),result:mia});
 const imp=require(path.join(root,'js/import.js'));
 const imported=imp.mapSignInCsv({UserPrincipalName:'alice@example.test',Date:'2026-09-01',Status:'Failure',IP:'192.0.2.1'});
 record('Flattened CSV drops subject and converts Failure to success',imported.status.errorCode===0&&!imported.userPrincipalName,imported);
 const gc=ctx({fetch:async()=>({status:200,ok:true,json:async()=>({value:[{id:'1'}],'@odata.nextLink':'https://graph.microsoft.com/next'})}),msal:{PublicClientApplication:class{async acquireTokenSilent(){return {accessToken:'offline-stub'}}}}});
 gc.window.TRIAGE_AUTH={scopes:[],clientId:'stub'};gc.window.location={origin:'http://localhost',pathname:'/'}; vm.runInContext(read('js/graph.js'),gc);
 const paged=await gc.window.TriageGraph.gall('https://graph.microsoft.com/start',1);
 record('Page cap returns ordinary array with no partial status',Array.isArray(paged)&&paged.length===1&&!paged.partial,{keys:Object.keys(paged),rows:paged.length});
 let fileCb;
 const bc=ctx({FileReader:class{readAsText(f){this.result=f.text;this.onload()}}});
 vm.runInContext(read('BETA/js/import.js'),bc);
 bc.window.BETA_Import.ingest([{name:'MailboxPermissions.csv',text:'Identity,User,AccessRights\nalice@example.test,bob@example.test,FullAccess'}],ev=>fileCb=ev);
 record('Beta mailbox permissions misclassified as OAuth',fileCb.sources[0].kind==='oauth',fileCb.sources);
 bc.window.BETA_Import.ingest([{name:'MFA.json',text:JSON.stringify([{userPrincipalName:'alice@example.test',methodsRegistered:['fido2']}])}],ev=>fileCb=ev);
 record('Native MFA array causes beta import error',fileCb.sources[0].kind==='error',fileCb.sources);
 bc.window.BETA_Import.ingest([{name:'MAS-web-evidence.json',text:JSON.stringify({scope:'tenant',findings:[{Title:'finding'}],users:[],stats:{}})}],ev=>fileCb=ev);
 record('Beta own evidence export is unrecognized',fileCb.sources[0].kind==='unknown',fileCb.sources);
 const children=[];
 const sc=ctx({process:{env:{TENANT_ID:'tenant',ORGANIZATION:'example.onmicrosoft.com',BACKEND_APP_ID:'backend',SPA_APP_ID:'spa'},exit(){throw Error('exit')}},require:n=>{
   if(n==='http')return {createServer:()=>({listen(){}})};
   if(n==='child_process')return {spawn:()=>{const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.kill=()=>{};children.push(p);return p;}};
   return require(n);
 }});
 vm.runInContext(read('backend/server.js'),sc);
 vm.runInContext('globalThis.bridge=exo;globalThis.roles=CFG.requiredRoles',sc);
 const p1=sc.bridge('rules-list',{Upn:'alice@example.test'}),p2=sc.bridge('forwarding-get',{Upn:'alice@example.test'});
 let err;try{await sc.bridge('delegates-list',{Upn:'alice@example.test'})}catch(e){err={status:e.status,message:e.message}}
 children.forEach(p=>{p.stdout.emit('data','[]');p.emit('close',0)});await Promise.all([p1,p2]);
 record('Third simultaneous mailbox request is rejected',err&&err.status===503,err);
 record('Backend defaults include Security and Privileged Role Administrators',sc.roles.includes('194ae4cb-b126-40b2-bd5b-6091b380977d')&&sc.roles.includes('e8611ab8-c189-46e8-94e1-60213ab1f814'),{roleIds:sc.roles});
 const out={date:'2026-09-14',commit:'8fb921c',purpose:'Reproduce existing issues; reproduced=true means defect observed, not a passing product test',results};
 fs.writeFileSync(path.join(__dirname,'reproductions.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
