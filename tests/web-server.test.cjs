const test = require("node:test"),
  assert = require("node:assert/strict");
async function withServer(fn) {
  const { createWebServer } = await import("../tools/serve-web.mjs");
  const s = createWebServer();
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  try {
    await fn("http://127.0.0.1:" + s.address().port);
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
}
test("container-free server serves the website, worker and branded assets with CSP", () =>
  withServer(async (base) => {
    for (const file of [
      "/BETA/",
      "/js/case-worker.js",
      "/assets/logo-mark-light.svg",
    ]) {
      const r = await fetch(base + file);
      assert.equal(r.status, 200, file);
      assert.match(
        r.headers.get("Content-Security-Policy"),
        /script-src 'self'/,
      );
      assert.equal(r.headers.get("Cache-Control"), "no-store");
    }
    const r = await fetch(base + "/BETA/", { method: "HEAD" });
    assert.equal(await r.text(), "");
  }));
test("container-free server denies private files, foreign hosts, writes and traversal", () =>
  withServer(async (base) => {
    for (const file of [
      "/desktop/main.cjs",
      "/backend/server.js",
      "/test-results/beta8-case.json",
      "/.env",
      "/BETA/%2e%2e/backend/server.js",
      "/BETA/downloads/private.json",
    ])
      assert.equal((await fetch(base + file)).status, 404, file);
    assert.equal(
      (await fetch(base + "/BETA/", { method: "POST" })).status,
      405,
    );
    const status = await new Promise((resolve, reject) =>
      require("node:http")
        .get(base + "/BETA/", { headers: { Host: "evil.example" } }, (r) => {
          r.resume();
          resolve(r.statusCode);
        })
        .on("error", reject),
    );
    assert.equal(status, 403);
  }));
