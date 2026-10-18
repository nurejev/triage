import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin='http://localhost:8080';
const response=await fetch(origin+'/BETA/');
assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
assert.match(response.headers.get('content-security-policy'),/frame-src 'self'/);
assert.match(await response.text(),/BETA 7/);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='darwin'?'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge':undefined)});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.addInitScript(()=>localStorage.setItem('triage-seen-build','999999'));
 await page.goto(origin+'/BETA/tenant.html');
 await page.waitForURL('**/BETA/?scope=tenant');
 const child=page.frameLocator('#tenantWorkspace iframe');
 await child.locator('#demoBtn').click();
 await child.locator('#startScanBtn').click();
 await child.locator('#screen-investigate:not([hidden])').waitFor();
 assert.equal(await page.locator('[data-stage="findings"]').getAttribute('aria-current'),'page');
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:950});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await child.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.locator('[data-stage="runbook"]').click();
 assert.ok(await page.locator('#sharedRunbook').isVisible());
 await page.locator('[data-stage="help"]').click();
 assert.ok(await page.locator('#screen-user-guide').isVisible());
 await page.locator('[data-scope="user"]').click();
 assert.ok(await page.locator('#tenantWorkspace').isHidden());
 assert.deepEqual(errors,[]);
 console.log('PASS local Docker Beta 7: headers, legacy-route redirect, embedded collection, shared navigation/runbook/walkthrough, responsive tenant findings at 1280/390/320, scope switch, no JavaScript errors.');
} finally {await browser.close();}
