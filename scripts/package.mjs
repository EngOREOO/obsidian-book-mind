// Builds the drop-in release folder and the distributable zip (release folder + full source, no node_modules).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

const root = resolve(".");
const dist = join(root, "release");
const plug = join(dist, "book-mind");
rmSync(dist, { recursive: true, force: true });
mkdirSync(plug, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(root, f), join(plug, f));

const src = join(dist, "source", basename(root));
mkdirSync(src, { recursive: true });
for (const f of ["src", "tests", "scripts", ".github", "package.json", "package-lock.json", "tsconfig.json", "esbuild.config.mjs", "manifest.json", "versions.json", "styles.css", "README.md", "CHANGELOG.md", "CONTRIBUTING.md", "LICENSE", ".gitignore"]) {
  if (existsSync(join(root, f))) cpSync(join(root, f), join(src, f), { recursive: true });
}
const zip = join(root, "book-mind-plugin.zip");
rmSync(zip, { force: true });
execFileSync("zip", ["-rq", "-X", zip, "book-mind", "source", "-x", "*.DS_Store"], { cwd: dist, stdio: "inherit" });
console.log("release folder:", plug);
console.log("zip:", zip);
