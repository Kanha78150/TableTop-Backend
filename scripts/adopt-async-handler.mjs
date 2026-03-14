/**
 * Phase 2: asyncHandler adoption script
 * Transforms controllers from manual try/catch to asyncHandler pattern.
 *
 * Run: node scripts/adopt-async-handler.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTROLLERS_DIR = path.join(ROOT, "src", "controllers");

// Recursively get all .controller.js files
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

// Determine the correct relative import path for asyncHandler
function getImportPath(filePath) {
  const rel = path.relative(
    path.dirname(filePath),
    path.join(ROOT, "src", "middleware")
  );
  return rel.replace(/\\/g, "/") + "/errorHandler.middleware.js";
}

// Check if a file uses class-based pattern
function isClassBased(content) {
  return (
    /^class\s+\w+/m.test(content) && /export default new \w+/m.test(content)
  );
}

// Check if a file already imports asyncHandler from our middleware
function alreadyUsesOwnAsyncHandler(content) {
  return (
    content.includes("errorHandler.middleware.js") &&
    content.includes("asyncHandler")
  );
}

let totalFiles = 0;
let transformedFiles = 0;
let totalFunctions = 0;
let skippedFiles = [];

const files = getControllerFiles(CONTROLLERS_DIR);

for (const filePath of files) {
  totalFiles++;
  let content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  // Skip files that already have our own asyncHandler
  if (alreadyUsesOwnAsyncHandler(content)) {
    skippedFiles.push({
      file: relPath,
      reason: "already uses own asyncHandler",
    });
    continue;
  }

  // Skip files already transformed (have asyncHandler wrapping)
  if (
    content.includes("asyncHandler(async") &&
    !content.includes('from "express-async-handler"')
  ) {
    skippedFiles.push({ file: relPath, reason: "already transformed" });
    continue;
  }

  // Skip class-based controllers (offer, user/menu, user/offer)
  if (isClassBased(content)) {
    skippedFiles.push({ file: relPath, reason: "class-based pattern" });
    continue;
  }

  let modified = false;
  let funcCount = 0;

  // Pattern 1: Switch from express-async-handler to our own
  if (
    content.includes('from "express-async-handler"') ||
    content.includes("from 'express-async-handler'")
  ) {
    const importPath = getImportPath(filePath);
    content = content.replace(
      /import\s+asyncHandler\s+from\s+["']express-async-handler["'];?\s*\n/,
      `import { asyncHandler } from "${importPath}";\n`
    );
    modified = true;
    // These files already use asyncHandler wrapping, so no further transformation needed
    funcCount = (content.match(/asyncHandler\(/g) || []).length;
  } else {
    // Pattern 2: Transform try/catch to asyncHandler

    // Step A: Add the asyncHandler import
    const importPath = getImportPath(filePath);
    const asyncHandlerImport = `import { asyncHandler } from "${importPath}";\n`;

    // Step B: Transform each export const function
    // Match: export const funcName = async (req, res, next) => {
    //   try {
    //     ... body ...
    //   } catch (error|err|e) {
    //     next(error|err|e);
    //   }
    // };

    // We'll use a multi-step approach for safety:
    // 1. Find all function boundaries
    // 2. For each function, check if it's a simple try/catch wrapping next(error)
    // 3. Transform only those

    const functionPattern =
      /export const (\w+)\s*=\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
    let match;
    const transforms = [];

    while ((match = functionPattern.exec(content)) !== null) {
      const funcName = match[1];
      const params = match[2];
      const startIdx = match.index;
      const bodyStart = match.index + match[0].length;

      // Find the end of this function by counting braces
      let braceCount = 1;
      let i = bodyStart;
      while (i < content.length && braceCount > 0) {
        if (content[i] === "{") braceCount++;
        if (content[i] === "}") braceCount--;
        i++;
      }
      // i now points to just after the closing }
      // Check for closing ;
      let endIdx = i;
      while (endIdx < content.length && /\s/.test(content[endIdx])) endIdx++;
      if (content[endIdx] === ";") endIdx++;

      const funcBody = content.substring(bodyStart, i - 1); // body inside outer braces

      // Check if the body starts with try { and ends with } catch (...) { next(...); }
      const trimmedBody = funcBody.trim();

      // Check for simple try/catch pattern (with optional logger.error before next)
      const tryMatch = trimmedBody.match(
        /^try\s*\{([\s\S]*)\}\s*catch\s*\((\w+)\)\s*\{\s*(?:logger\.error\([^)]*(?:,\s*\2)?\);\s*)?next\(\2\);\s*\}$/
      );

      if (tryMatch && params.includes("next")) {
        const innerBody = tryMatch[1];
        // Remove 'next' from params
        const newParams = params
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p !== "next")
          .join(", ");

        transforms.push({
          funcName,
          start: startIdx,
          end: endIdx,
          newParams,
          innerBody,
        });
        funcCount++;
      }
    }

    if (transforms.length > 0) {
      // Apply transforms in reverse order to preserve indices
      for (let t = transforms.length - 1; t >= 0; t--) {
        const { funcName, start, end, newParams, innerBody } = transforms[t];
        // Dedent the inner body by 2 spaces (removing the try block indentation)
        const dedentedBody = innerBody
          .split("\n")
          .map((line) => {
            if (line.match(/^\s{4}/)) {
              return line.substring(2); // Remove 2 spaces of indentation from try block
            }
            return line;
          })
          .join("\n");

        const newFunc = `export const ${funcName} = asyncHandler(async (${newParams}) => {${dedentedBody}});`;
        content =
          content.substring(0, start) + newFunc + content.substring(end);
      }

      // Add the import
      // Find the best place to insert - after the last import statement
      const lastImportMatch = [...content.matchAll(/^import\s.+$/gm)];
      if (lastImportMatch.length > 0) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        const insertPos = lastImport.index + lastImport[0].length;
        content =
          content.substring(0, insertPos) +
          "\n" +
          asyncHandlerImport +
          content.substring(insertPos);
      } else {
        content = asyncHandlerImport + content;
      }

      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    transformedFiles++;
    totalFunctions += funcCount;
    console.log(`✓ ${relPath} (${funcCount} functions)`);
  } else {
    skippedFiles.push({ file: relPath, reason: "no matching patterns" });
  }
}

console.log("\n=== Summary ===");
console.log(`Total files scanned: ${totalFiles}`);
console.log(`Transformed: ${transformedFiles}`);
console.log(`Functions converted: ${totalFunctions}`);
console.log(`\nSkipped files:`);
for (const s of skippedFiles) {
  console.log(`  - ${s.file}: ${s.reason}`);
}
