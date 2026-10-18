import fs from "node:fs";
import { spawnSync } from "node:child_process";
const tests = fs
  .readdirSync("tests")
  .filter((f) => f.endsWith(".test.cjs"))
  .map((f) => "tests/" + f);
for (const args of [["BETA/beta.engine.test.mjs"], ["--test", ...tests]]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("Beta tests complete (no Docker required).");
