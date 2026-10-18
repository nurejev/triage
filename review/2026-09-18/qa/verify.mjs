import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir=path.resolve('review/2026-09-18/qa');
const fragment=fs.readFileSync(path.resolve(dir,'../workflow-mockup.html'),'utf8');
const preview=path.join(dir,'mockup-preview.html');
fs.writeFileSync(preview,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Triage case concept</title><style>html{color-scheme:light dark}body{margin:0}body>div{width:100%}</style></head><body>'+fragment+'</body></html>');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({env,args:['review/2026-09-18/qa/browser.cjs'],executablePath:path.resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')});
const page=await app.firstWindow();
const errors=[],external=[];
page.on('pageerror',error=>errors.push(error.message));
await page.context().route(/^https?:/,route=>{external.push(route.request().url());return route.abort();});
await page.addInitScript(()=>{window.__design=[];window.__saved=[];window.openai={widgetState:null,setWidgetState:async s=>{window.__saved.push(s);}};window.Tweak=class{constructor(options){this.options=options;}addSelect(object,key,options){window.__design.push({object,key,options,render:this.options.onChange});}};});
const checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push({name,result:'passed'});};
try{
  await page.setViewportSize({width:1024,height:1000});
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('file://'+preview);
  check('Review opens by default',await page.getByRole('heading',{name:'Review the evidence.',exact:true}).isVisible());
  check('Exactly one primary action in Review',await page.locator('main button.tc-primary').count()===1);
  await page.screenshot({path:path.join(dir,'mockup-desktop.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:path.join(dir,'mockup-dark.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'light'});
  await page.locator('[name=note]').fill('The recorded event confirms a forwarding change. Authorisation and current configuration remain unknown.');
  await page.getByRole('button',{name:'Save decision',exact:true}).click();
  check('Saved decision updates progress',await page.locator('main').innerText().then(t=>t.includes('1 of 3 decisions recorded')));
  check('Incomplete review has no completion tick',await page.locator('nav [data-go=review] .tc-step').innerText()==='5');
  await page.locator('[data-finding="1"]').click();
  check('Selecting a finding changes its evidence reference',await page.locator('.tc-evidence').textContent().then(t=>t.includes('audits:12')));
  await page.locator('[name=note]').fill('Unfinished draft');
  await page.locator('nav [data-go=collect]').click();
  check('Partial collection states stay explicit',await page.locator('main').innerText().then(t=>t.includes('1 partial')&&t.includes('1 unavailable')));
  await page.getByRole('button',{name:'Review available evidence →',exact:true}).click();
  check('Unsaved review draft survives navigation',await page.locator('[name=note]').inputValue()==='Unfinished draft');
  await page.locator('nav [data-go=respond]').click();
  await page.getByRole('button',{name:'Record plan · demo',exact:true}).click();
  check('Plan does not imply execution',await page.locator('main').innerText().then(t=>t.includes('No action executed.')));
  await page.locator('nav [data-go=handover]').click();
  await page.getByRole('button',{name:'Prepare package preview',exact:true}).click();
  check('Prepared package does not mark handover complete',await page.locator('nav [data-go=handover]').innerText().then(t=>t.includes('Prepared · not handed over')));
  await page.locator('[name=owner]').fill('Incident response team');
  await page.getByRole('button',{name:'Record handover · demo',exact:true}).click();
  check('Handover records an explicit owner',await page.locator('[role=status]').innerText().then(t=>t.includes('Incident response team')));
  check('Host state persistence receives interaction state',await page.evaluate(()=>window.__saved.length>0));
  await page.locator('nav [data-go=review]').click();
  const widths=[1024,736,390,320];
  const responsive=[];
  for(const width of widths){
    await page.setViewportSize({width,height:1000});
    const result=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,root:document.getElementById('triage-case-concept').getBoundingClientRect().width}));
    check(`No document overflow at ${width}px`,result.document<=width);
    responsive.push(result);
    if(width===390){await page.screenshot({path:path.join(dir,'mockup-mobile.png'),fullPage:true});await page.locator('[data-menu-toggle]').click();check('Mobile step menu exposes all seven states',await page.locator('nav button:visible').count()===7);await page.locator('nav [data-go=collect]').click();check('Mobile selection opens collection details',await page.getByRole('heading',{name:'Collection ended with gaps.',exact:true}).isVisible());await page.getByRole('button',{name:'Review available evidence →',exact:true}).click();}
  }
  for(const navigation of ['flat','grouped','top']){
    await page.setViewportSize({width:1024,height:1000});
    await page.evaluate(value=>{const t=window.__design.find(t=>t.key==='navigation');t.object.navigation=value;t.render();},navigation);
    check(`${navigation} navigation is selectable`,await page.locator('#triage-case-concept').getAttribute('data-navigation')===navigation);
    check(`${navigation} navigation fits desktop`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.evaluate(()=>{const t=window.__design.find(t=>t.key==='detail');t.object.detail='below';t.render();});
  check('Inspector placement control works',await page.locator('#triage-case-concept').getAttribute('data-detail')==='below');
  check('No external requests',external.length===0);
  check('No browser JavaScript errors',errors.length===0);
  fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify({scope:'Local static prototype only; no tenant connections or production tests',checks,responsive,errors,external},null,2));
  console.log(JSON.stringify({passed:checks.length,responsive,errors,external}));
}finally{await app.close();}
