// Bundles the pure-core smoke test (no Obsidian runtime needed) and runs it.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "bm-")), "smoke.cjs");
await esbuild.build({ entryPoints: ["tests/core.smoke.ts"], bundle: true, platform: "node", format: "cjs", outfile: out, external: ["obsidian"], logLevel: "error" });
execFileSync("node", [out], { stdio: "inherit" });
