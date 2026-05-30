import { mkdir, readFile, unlink, writeFile, opendir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { $ } from "bun";

async function buildUserScript(entrypoint: string): Promise<void> {
  const outfile = `dist/${dirname(entrypoint).split('/').pop()}.user.js`;
  const temporaryOutfile = `dist/.${dirname(entrypoint).split('/').pop()}.bundle.js`;
  const temporarySourceFile = join(dirname(entrypoint), `.index.user.ts`);

  const entrypointSource = await readFile(entrypoint, "utf8");

  // Extract userscript metadata
  const metadataMatch = entrypointSource.match(/^\/\/ ==UserScript==\n[\s\S]*?^\/\/ ==\/UserScript==/m);
  const metadata = metadataMatch ? metadataMatch[0] : null;

  if (!metadata) {
    throw new Error(`Missing userscript metadata block in ${entrypoint}`);
  }

  // Extract build.meta block
  const buildMetaMatch = entrypointSource.match(/^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==/m);
  let buildMeta = {};
  if (buildMetaMatch) {
    const buildMetaBlock = buildMetaMatch[0];
    // Parse each line in the block
    const lines = buildMetaBlock.split('\n').slice(1, -1); // remove the first and last line (the ==build.meta== and ==/build.meta==)
    for (const line of lines) {
      const lineTrimmed = line.trim();
      if (lineTrimmed.startsWith('// ')) {
        const content = lineTrimmed.slice(3); // remove '// '
        const [key, value] = content.split(':').map(s => s.trim());
        if (key && value) {
          buildMeta[key] = value;
        }
      }
    }
  }
  // Remove the build.meta block from the entrypoint source for bundling
  const sourceForBundling = entrypointSource.replace(buildMetaMatch ? buildMetaMatch[0] : '', '');

  await mkdir(dirname(outfile), { recursive: true });
  // Write the source without build.meta block to a temporary file in the same directory as the entrypoint
  await writeFile(temporarySourceFile, sourceForBundling, "utf8");
  // Build the temporary source file
  await $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none`;

  let bundle = await readFile(temporaryOutfile, "utf8");

  // If we have a CSS file and placeholder from build.meta, replace the placeholder with CSS content
  if (buildMeta.css && buildMeta.placeholder) {
    const css = await readFile(buildMeta.css, "utf8");
    // Escape backticks and dollar signs in the CSS string for use in a template literal
    const escapedCss = css.replace(/`/g, "\\`").replace(/\$/g, "\\$").trim();
    // Replace the placeholder with the escaped CSS
    bundle = bundle.replace(buildMeta.placeholder, escapedCss);
  }

  // Remove any remaining build.meta block from the bundled code (just in case)
  // This is a safety measure, but we removed it from the source so it shouldn't be in the bundle.
  bundle = bundle.replace(/^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==\n/m, '');

  await writeFile(outfile, `${metadata}\n\n${bundle}`);
  await unlink(temporaryOutfile);
  await unlink(temporarySourceFile);
}

async function main() {
  const srcDir = "src";
  const entries = [];

  // Read src directory
  const dir = await opendir(srcDir);
  for await (const dirent of dir) {
    if (dirent.isDirectory()) {
      const entryPoint = join(srcDir, dirent.name, "index.user.ts");
      try {
        await stat(entryPoint);
        entries.push(entryPoint);
      } catch (err) {
        // No index.user.ts in this directory, skip
      }
    }
  }
  await dir.close();

  if (entries.length === 0) {
    console.log("No index.user.ts files found in src subdirectories");
    return;
  }

  console.log(`Found ${entries.length} entry point(s): ${entries.join(", ")}`);

  // Build each entry point
  for (const entrypoint of entries) {
    try {
      console.log(`Building ${entrypoint}...`);
      await buildUserScript(entrypoint);
      console.log(`✓ Built ${entrypoint}`);
    } catch (error) {
      console.error(`✗ Failed to build ${entrypoint}:`, error);
    }
  }
}

main().catch(console.error);