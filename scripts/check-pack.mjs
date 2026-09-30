import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "npm pack failed\n");
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write("npm pack did not return its expected JSON report\n");
  process.exit(1);
}

const files = new Set(report[0]?.files?.map(({ path }) => path) ?? []);
const required = ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts"];
const missing = required.filter((path) => !files.has(path));
const unwanted = [...files].filter((path) => /^(src|test|node_modules)\//.test(path));

if (missing.length || unwanted.length) {
  process.stderr.write([
    missing.length ? `package is missing: ${missing.join(", ")}` : "",
    unwanted.length ? `package contains development files: ${unwanted.join(", ")}` : "",
  ].filter(Boolean).join("\n") + "\n");
  process.exit(1);
}

process.stdout.write(`Package contents verified (${files.size} files).\n`);
