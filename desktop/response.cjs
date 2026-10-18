'use strict';
const GUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateContext(v){
 if(!v || !GUID.test(v.tenantId)||!GUID.test(v.objectId)||!GUID.test(v.caseId)||!/^\S+@\S+\.\S+$/.test(v.upn||''))throw Error('Response requires a resolved account and tenant');
 return {tenantId:v.tenantId,objectId:v.objectId,caseId:v.caseId,upn:v.upn};
}
function validateRequest(context,input){
 const c=validateContext(context), u=new URL(input.url), method=input.method||'GET';
 if(u.origin!=='https://graph.microsoft.com'||u.username||u.password||u.hash||!/^\/(v1\.0|beta)\//.test(u.pathname))throw Error('Untrusted response endpoint');
 const p=decodeURIComponent(u.pathname.replace(/^\/(v1\.0|beta)/,''));
 const own='/users/'+c.objectId;
 let body=input.body===undefined?undefined:typeof input.body==='string'?JSON.parse(input.body):input.body;
 if(method==='GET'){
  if(!/^\/(users|auditLogs|identityProtection|oauth2PermissionGrants|servicePrincipals|security\/auditLog\/queries)(\/|$)/.test(p))throw Error('Unsupported response read');
  if(p.startsWith('/users/') && !p.startsWith(own+'/') && p!==own && !p.startsWith('/users/'+c.upn+'/') && p!=='/users/'+c.upn)throw Error('Wrong response subject');
 }else if(method==='POST' && p==='/security/auditLog/queries'){
  if(!Array.isArray(body?.userPrincipalNameFilters)||body.userPrincipalNameFilters.length!==1||body.userPrincipalNameFilters[0]!==c.upn)throw Error('Audit query must target this account');
 }else if(method==='POST' && p===own+'/revokeSignInSessions'){
  if(body && Object.keys(body).length)throw Error('Unexpected revocation body');
 }else if(method==='PATCH' && p===own){
  const keys=Object.keys(body||{});
  if(keys.length!==1 || !(typeof body.accountEnabled==='boolean'||(keys[0]==='passwordProfile'&&typeof body.passwordProfile?.password==='string'&&body.passwordProfile.forceChangePasswordNextSignIn===true)))throw Error('Unsupported account change');
 }else if(method==='DELETE' && (new RegExp('^'+own+'/authentication/[A-Za-z]+Methods/[^/]+$').test(p)||/^\/oauth2PermissionGrants\/[^/]+$/.test(p))){
  if(body!==undefined)throw Error('Unexpected deletion body');
 }else throw Error('Unsupported response operation');
 return {...c,url:u.href,method,body,write:method!=='GET' && !(method==='POST'&&p==='/security/auditLog/queries')};
}
module.exports={validateContext,validateRequest};
