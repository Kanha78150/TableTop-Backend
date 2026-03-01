/**
 * Fix broken imports where asyncHandler was inserted inside multi-line import blocks
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
    if (entry.isDirectory()) files.push(...getControllerFiles(fullPath));
    else if (entry.name.endsWith(".controller.js")) files.push(fullPath);
  }
  return files;
}

let fixedCount = 0;

for (const filePath of getControllerFiles(CONTROLLERS_DIR)) {
  let content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  // Pattern: import {\nimport { asyncHandler } from "...errorHandler...";\n\n  actualImports\n} from "...";
  const brokenPattern =
    /import \{\nimport \{ asyncHandler \} from "([^"]+)";\n\n([\s\S]*?)\} from "([^"]+)";/g;

  let match;
  let modified = false;

  while ((match = brokenPattern.exec(content)) !== null) {
    const asyncHandlerPath = match[1];
    const importBody = match[2];
    const fromModule = match[3];

    const fixed = `import {\n${importBody}} from "${fromModule}";\nimport { asyncHandler } from "${asyncHandlerPath}";`;
    content = content.replace(match[0], fixed);
    modified = true;
    fixedCount++;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`✓ Fixed: ${relPath}`);
  }
}

console.log(`\nTotal files fixed: ${fixedCount}`);
