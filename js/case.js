// Shared case adapters and session cancellation. Imported evidence never grants authority.
(function () {
  'use strict';
  let generation = 0, controller = new AbortController(), current = null;
  const clone = x => JSON.parse(JSON.stringify(x));
  const lower = x => String(x || '').toLowerCase();
  function reset() { controller.abort(); controller = new AbortController(); generation++; current = null; }
  function assert(version) { if (version !== generation || controller.signal.aborted) throw new DOMException('Case/session changed', 'AbortError'); }
  function same(a, b) { return !!(a && b && a.tenantId && a.objectId && a.caseId && a.tenantId === b.tenantId && a.objectId === b.objectId && a.caseId === b.caseId); }
  function identity(ev) { return {tenantId:ev.tenantId || '',objectId:ev.user?.id || ev.subject?.objectId || '',caseId:ev.caseId || ''}; }
  function subject(ev, upn) {
    const result = clone(ev), name = lower(upn);
    const user = (ev.users || []).find(u => lower(u.userPrincipalName) === name) || (lower(ev.user?.userPrincipalName) === name ? ev.user : null) || (lower(ev.subject?.upn) === name ? {id:ev.subject.objectId,userPrincipalName:ev.subject.upn} : null);
    result.parentScope = ev.parentScope || ev.scope; result.upn = upn; result.user = user || {userPrincipalName:upn}; result.scope = 'user';
    result.subject = {upn, objectId:user?.id || ''};
    result.signIns = (ev.signIns || []).filter(r => lower(r.userPrincipalName) === name || (user?.id && r.userId === user.id));
    result.ualRecords = (ev.ualRecords || []).filter(r => lower(r.userPrincipalName || r.auditData?.UserId) === name);
    result.directoryAudits = (ev.directoryAudits || []).filter(r => lower(r.initiatedBy?.user?.userPrincipalName) === name || r.targetResources?.some(t => (user?.id && t.id === user.id) || lower(t.userPrincipalName) === name));
    result.oauthGrants = (ev.oauthGrants || []).filter(r => lower(r.principalUpn) === name || (user?.id && r.principalId === user.id) || r.consentType === 'AllPrincipals');
    for (const key of ['riskyUsers','riskDetections']) result[key] = (ev[key] || []).filter(r => lower(r.userPrincipalName) === name || (user?.id && (r.userId === user.id || r.id === user.id)));
    result.authMethods = lower(ev.upn) === name ? ev.authMethods || {loaded:false,methods:[]} : {loaded:false,methods:[]};
    return result;
  }
  function ensure(ev) {
    ev.caseId ||= crypto.randomUUID(); ev.tenantId ||= ev.demo ? '11111111-1111-1111-1111-111111111111' : '';
    ev.manifest ||= {}; // A legacy export without dates has unverified coverage.
    if (!ev.window) ev.provenance = 'Requested window unavailable';
    return ev;
  }
  function sourceReady(ev,key,days) {
    if (ev?.demo) return true;
    const m = (ev?.quickManifest || ev?.manifest)?.[key], w = m?.window;
    if (m?.state !== 'complete' || !w) return false;
    const end = Date.parse(ev.window?.end || w.end), start = end-days*864e5;
    return Date.parse(w.start) <= start && Date.parse(w.end) >= end;
  }
  function toCommon(input) {
    if (input.raw && input.manifest) return clone(input);
    const E = window.BETA_Evidence, ev = E.create({caseId:input.caseId || crypto.randomUUID(),tenantId:input.tenantId || '',scope:'user',upn:input.upn,demo:!!input.demo,imported:!!input.imported,window:input.window,days:input.days});
    const mapping = {interactive:'signIns',nonInteractive:'signIns',audits:'directoryAudits',riskyUsers:'riskyUsers',riskDetections:'riskDetections',oauth:'oauthGrants',ual:'ualRecords'};
    for (const [key,field] of Object.entries(mapping)) E.setSource(ev,key,clone(field==='signIns' ? (input.signIns || []).filter(r=>key==='nonInteractive' ? r.signInEventTypes?.includes('nonInteractiveUser') : !r.signInEventTypes?.includes('nonInteractiveUser')) : input[field] || []),clone(input.manifest?.[{interactive:'signins',nonInteractive:'signins',riskyUsers:'risky',riskDetections:'risky'}[key] || key] || {state:input.demo?'complete':'imported',note:'Legacy coverage unverified'}));
    E.setSource(ev,'users',input.user?.id?[clone(input.user)]:[],{state:input.demo?'complete':'imported',note:'Selected user only'});
    ev.user = clone(input.user || {}); ev.authMethods = clone(input.authMethods || {loaded:false,methods:[]});
    ev.subject = {upn:input.upn,objectId:input.user?.id || ''}; ev.actionHistory = clone(input.actionHistory || []);
    ev.dispositions = clone(input.dispositions || {}); ev.notes = input.notes || '';
    ev.quickManifest = clone(input.manifest || {});
    if(input.analysis)ev.analysis=clone(input.analysis);
    if(input.findings)ev.analysis ||= {engine:'legacy-quick',ruleVersion:'unverified',findings:clone(input.findings)};
    return ev;
  }
  async function bundle(ev) { return window.BETA_Evidence.bundle(toCommon(ensure(ev))); }
  window.TriageCase = {reset,assert,same,identity,subject,ensure,sourceReady,toCommon,bundle,
    get generation(){return generation;}, get signal(){return controller.signal;},
    get current(){return current;}, set current(ev){current=ev; if(typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("triage-case"));}};
})();
