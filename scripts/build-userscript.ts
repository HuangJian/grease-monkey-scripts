import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { $ } from "bun";

const entrypoint = "src/v2ex-time-saver/index.user.ts";
const outfile = "dist/v2ex-time-saver.user.js";
const temporaryOutfile = "dist/.v2ex-time-saver.bundle.js";

const source = await readFile(entrypoint, "utf8");
const metadata = source.match(/^\/\/ ==UserScript==\n[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0];

if (!metadata) {
  throw new Error(`Missing userscript metadata block in ${entrypoint}`);
}

await mkdir(dirname(outfile), { recursive: true });
await $`bun build ${entrypoint} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none`;

const bundle = await readFile(temporaryOutfile, "utf8");
await writeFile(outfile, `${metadata}\n\n${bundle}`);
await unlink(temporaryOutfile);
