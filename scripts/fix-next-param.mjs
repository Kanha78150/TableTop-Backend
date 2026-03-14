/**
 * Fix: Re-add 'next' param to asyncHandler-wrapped functions that still reference next() in body
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTROLLERS_DIR = path.join(ROOT, "src", "controllers");

function getControllerFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getControllerFiles(fullPath));
    } else if (entry.name.endsWith(".controller.js")) {
      files.push(fullPath);
    }
  }
  return files;
}

let fixedCount = 0;
const files = getControllerFiles(CONTROLLERS_DIR);

for (const filePath of files) {
  let content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  if (!content.includes("asyncHandler(async")) continue;

  let modified = false;

  // Find each asyncHandler-wrapped function
  const pattern = /asyncHandler\(async\s*\((req,\s*res)\)\s*=>\s*\{/g;
  let match;
  const fixes = [];

  while ((match = pattern.exec(content)) !== null) {
    const funcStart = match.index + match[0].length;

    // Find the end of this function by counting braces
    let braceCount = 1;
    let i = funcStart;
    while (i < content.length && braceCount > 0) {
      if (content[i] === "{") braceCount++;
      if (content[i] === "}") braceCount--;
      i++;
    }

    const funcBody = content.substring(funcStart, i - 1);

    // Check if function body references next(
    if (/\bnext\s*\(/.test(funcBody)) {
      fixes.push({
        matchStart: match.index,
        oldText: match[0],
        newText: match[0].replace("(req, res)", "(req, res, next)"),
      });
    }
  }

  if (fixes.length > 0) {
    // Apply fixes in reverse order
    for (let f = fixes.length - 1; f >= 0; f--) {
      const { matchStart, oldText, newText } = fixes[f];
      content =
        content.substring(0, matchStart) +
        newText +
        content.substring(matchStart + oldText.length);
    }
    fs.writeFileSync(filePath, content, "utf8");
    fixedCount += fixes.length;
    console.log(`✓ ${relPath}: ${fixes.length} function(s) fixed`);
    modified = true;
  }
}

console.log(`\nTotal functions fixed: ${fixedCount}`);
