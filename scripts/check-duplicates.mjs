import { readdir } from "node:fs/promises";
import path from "node:path";

const APP_DIR = path.resolve(process.cwd(), "app");
const DUPLICATE_NAME_PATTERN = /\s\d+\.(ts|tsx)$/i;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

async function main() {
  const allFiles = await walk(APP_DIR);
  const suspicious = allFiles.filter(file => DUPLICATE_NAME_PATTERN.test(file));

  if (suspicious.length === 0) {
    return;
  }

  console.error("Duplicate-like route/page files detected:");
  suspicious.forEach(file => {
    console.error(`- ${path.relative(process.cwd(), file)}`);
  });
  console.error("\nRename/remove these files before running dev/build.");
  process.exit(1);
}

main().catch(error => {
  console.error("Failed to run duplicate file check:", error);
  process.exit(1);
});
