import { packager } from "@electron/packager";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../.."),
  desktop = path.join(root, "desktop");
const target = process.argv[2] || "darwin-arm64",
  separator = target.lastIndexOf("-"),
  platform = target.slice(0, separator),
  arch = target.slice(separator + 1);
if (!["darwin-arm64", "win32-x64"].includes(target))
  throw Error("Unsupported desktop target");
const stage = path.join(desktop, ".stage", target);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const name of ["main.cjs", "preload.cjs", "core.cjs", "profiles.cjs", "response.cjs", "package.json"])
  fs.copyFileSync(path.join(desktop, name), path.join(stage, name));
const stagedSite = path.join(stage, "site");
fs.mkdirSync(stagedSite, { recursive: true });
for (const folder of ["BETA", "js", "assets", "vendor"])
  fs.cpSync(path.join(root, folder), path.join(stagedSite, folder), {
    recursive: true,
    filter: (src) =>
      !src.includes("/downloads") &&
      !src.endsWith(".test.mjs") &&
      !src.includes("/test-results"),
  });
fs.copyFileSync(
  path.join(root, "index.html"),
  path.join(stagedSite, "index.html"),
);
// Include the exact stylesheet required by the root Microsoft sign-in reply page.
fs.cpSync(path.join(root, "css"), path.join(stagedSite, "css"), {
  recursive: true,
});
const runtime = path.join(desktop, "runtime", target);
if (!fs.existsSync(runtime))
  throw Error("Run desktop:runtime before packaging");
const stagedRuntime = path.join(stage, "runtime");
fs.cpSync(runtime, stagedRuntime, { recursive: true });
// Packager clears its temp root; give each platform run an isolated root.
const packageTemp = fs.mkdtempSync(
  path.join(os.tmpdir(), `triage-package-${target}-`),
);
let built;
try {
  built = await packager({
    tmpdir: packageTemp,
    dir: stage,
    out: path.join(desktop, "out"),
    name: "Triage",
    platform,
    arch,
    electronVersion: "44.3.0",
    overwrite: true,
    asar: true,
    extraResource: [stagedSite, stagedRuntime, path.join(desktop, "collector")],
    icon: path.join(desktop, platform === "darwin" ? "icon.icns" : "icon.ico"),
    osxSign:
      platform === "darwin"
        ? {
            identity: "-",
            identityValidation: false,
            preAutoEntitlements: false,
            preEmbedProvisioningProfile: false,
            optionsForFile: () => ({
              hardenedRuntime: false,
              entitlements: ["com.apple.security.cs.allow-jit"],
              timestamp: "none",
            }),
          }
        : undefined,
    appBundleId: "nl.limon-it.triage",
    appCategoryType: "public.app-category.utilities",
    prune: true,
    ignore: [/^\/runtime/, /^\/site/],
  });
} finally {
  fs.rmSync(packageTemp, { recursive: true, force: true });
}
const downloads = path.join(root, "BETA", "downloads");
fs.mkdirSync(downloads, { recursive: true });
const archive = path.join(
  downloads,
  platform === "darwin" ? "Triage-macOS-arm64.zip" : "Triage-Windows-x64.zip",
);
// Complete and validate a new ZIP before replacing a working download.
const temporary = archive.replace(/\.zip$/, ".pending.zip");
fs.rmSync(temporary, { force: true });
if (platform === "darwin") {
  const appPath = path.join(built[0], "Triage.app");
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: "inherit" },
  );
  execFileSync("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    appPath,
    temporary,
  ]);
  const check = fs.mkdtempSync(path.join(os.tmpdir(), "triage-mac-archive-"));
  try {
    execFileSync("ditto", ["-x", "-k", temporary, check]);
    execFileSync(
      "codesign",
      [
        "--verify",
        "--deep",
        "--strict",
        "--verbose=2",
        path.join(check, "Triage.app"),
      ],
      { stdio: "inherit" },
    );
    const output = execFileSync(
      path.join(check, "Triage.app/Contents/MacOS/Triage"),
      ["--smoke-test"],
      { encoding: "utf8", timeout: 60000 },
    );
    if (
      !output.split("\n").some((line) => {
        try {
          const r = JSON.parse(line);
          return r.loaded && r.ready;
        } catch {
          return false;
        }
      })
    )
      throw Error("Extracted app failed its runtime launch check");
    console.log(
      "Extracted ZIP: valid signature, app launch and bundled runtime readiness passed.",
    );
  } finally {
    fs.rmSync(check, { recursive: true, force: true });
  }
} else
  execFileSync("python3", [
    "-c",
    'import shutil,sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2])',
    temporary.slice(0, -4),
    built[0],
  ]);
fs.renameSync(temporary, archive);
console.log(archive);
