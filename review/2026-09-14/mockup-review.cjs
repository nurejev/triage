const fs=require('fs'),path=require('path');
const {chromium}=require('/Users/mihaimonte/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
const page=await browser.newPage({viewport:{width:1120,height:1000},colorScheme:'light'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8765/review/2026-09-14/mockup-preview.html');const frame=page.frameLocator('iframe');await frame.locator('#triage-concepts').waitFor();
await frame.locator('#triage-concepts').screenshot({path:path.join(__dirname,'mockup-investigation.png')});
await frame.locator('[data-finding="1"]').click();if(!await frame.locator('#tri-finding-title').textContent().then(t=>t.includes('unfamiliar')))throw Error('finding selection failed');
await frame.locator('[data-tab="timeline"]').click();if(!await frame.locator('[data-subpanel="timeline"]').isVisible())throw Error('timeline toggle failed');
await frame.locator('.tri-nav [data-view="collect"]').click();await frame.locator('#triage-concepts').screenshot({path:path.join(__dirname,'mockup-collection.png')});
await frame.locator('#tri-resume').click();if(!await frame.locator('#tri-job-result').textContent().then(t=>t.includes('5 of 5')))throw Error('resume failed');
await frame.locator('#tri-route').selectOption('browser');if(!await frame.locator('#tri-store').textContent().then(t=>t.includes('browser tab')))throw Error('route change failed');
await frame.locator('.tri-nav [data-view="contain"]').click();await frame.locator('#triage-concepts').screenshot({path:path.join(__dirname,'mockup-containment.png')});
await frame.locator('#tri-confirm').check();await frame.locator('#tri-preview-change').click();if(!await frame.locator('#tri-change-result').textContent().then(t=>t.includes('No action executed')))throw Error('action preview failed');
await page.emulateMedia({colorScheme:'dark'});await frame.locator('.tri-nav [data-view="investigate"]').click();await frame.locator('[data-tab="findings"]').click();await frame.locator('#triage-concepts').screenshot({path:path.join(__dirname,'mockup-dark.png')});
const sizes=[];for(const w of [1024,736,390,320]){await page.setViewportSize({width:w,height:1000});for(const v of ['investigate','collect','contain']){await frame.locator('.tri-nav [data-view="'+v+'"]').click();sizes.push(await frame.locator('#triage-concepts').evaluate((root,{w,v})=>({viewport:w,view:v,width:root.clientWidth,scrollWidth:root.scrollWidth}),{w,v}));}}
// The preview wrapper uses a fixed-height iframe; expand it for full mobile captures.
const mobileHeight=await frame.locator('#triage-concepts').evaluate(root=>Math.ceil(root.getBoundingClientRect().height));
await page.locator('iframe').evaluate((el,h)=>el.style.height=h+'px',mobileHeight+20);
await page.setViewportSize({width:320,height:mobileHeight+100});
await page.locator('iframe').evaluate((el,h)=>el.style.height=h+'px',mobileHeight+20);
await frame.locator('#triage-concepts').screenshot({path:path.join(__dirname,'mockup-mobile.png')});
await page.setViewportSize({width:1024,height:1000});
await frame.locator('.tri-nav [data-view="investigate"]').click();
await frame.locator('#triage-concepts').evaluate(root=>{root.dataset.layout='focus';root.style.setProperty('--tri-gap','12px');});
await page.emulateMedia({colorScheme:'light'});
await frame.locator('#triage-concepts').screenshot({path:path.join(__dirname,'mockup-top-navigation.png')});
const result={errors,interactions:'finding, timeline, navigation, route, resume, confirmation passed',sizes};fs.writeFileSync(path.join(__dirname,'mockup-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
