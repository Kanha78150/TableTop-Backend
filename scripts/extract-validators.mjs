/**
 * Phase 4: Extract Joi validators from model files into src/validators/
 *
 * Strategy:
 * - For each model with Joi, find validation code after `mongoose.model()`
 * - Create a validator file with that code
 * - Replace model's validation exports with re-exports from validator file
 *
 * Run: node scripts/extract-validators.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MODELS_DIR = path.join(ROOT, "src", "models");
const VALIDATORS_DIR = path.join(ROOT, "src", "validators");

// Get all model files
const modelFiles = fs
  .readdirSync(MODELS_DIR)
  .filter((f) => f.endsWith(".model.js"))
  .map((f) => path.join(MODELS_DIR, f));

let created = 0;
let skipped = 0;

for (const modelPath of modelFiles) {
  const fileName = path.basename(modelPath);
  const content = fs.readFileSync(modelPath, "utf8");

  // Skip if no Joi import
  if (!content.includes('from "joi"') && !content.includes("from 'joi'")) {
    skipped++;
    continue;
  }

  // Derive validator file name: Hotel.model.js -> hotel.validators.js
  const baseName = fileName.replace(".model.js", "").toLowerCase();
  const validatorFileName = `${baseName}.validators.js`;
  const validatorPath = path.join(VALIDATORS_DIR, validatorFileName);

  // Skip if validator file already exists
  if (fs.existsSync(validatorPath)) {
    console.log(`⏭  ${validatorFileName} already exists, skipping`);
    skipped++;
    continue;
  }

  // Find the model export line: export const ModelName = mongoose.model(...)
  // Everything after this line is validation code
  const lines = content.split("\n");
  let modelExportLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^export const \w+ = mongoose\.model\(/)) {
      modelExportLine = i;
    }
  }

  if (modelExportLine === -1) {
    console.log(
      `⚠  ${fileName}: couldn't find mongoose.model() export, skipping`
    );
    skipped++;
    continue;
  }

  // Find the first validation export after the model export
  let validationStart = -1;
  for (let i = modelExportLine + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.startsWith("export const validate") ||
      (line.startsWith("export const ") &&
        line.includes("ValidationSchemas")) ||
      (line.startsWith("export const ") &&
        line.includes("validationSchemas")) ||
      line.startsWith("export const cartValidation") ||
      line.startsWith("export const coinSettings") ||
      line.startsWith("export const coinTransaction") ||
      line.startsWith("export const foodCategory") ||
      line.startsWith("export const foodItem") ||
      (line.startsWith("export const manager") &&
        line.includes("Validation")) ||
      (line.startsWith("export const offer") && line.includes("Validation")) ||
      (line.startsWith("export const refund") && line.includes("Validation")) ||
      (line.startsWith("export const staff") && line.includes("Validation")) ||
      (line.startsWith("export const table") && line.includes("Validation"))
    ) {
      validationStart = i;
      break;
    }
  }

  if (validationStart === -1) {
    console.log(
      `⚠  ${fileName}: no validation exports found after model, skipping`
    );
    skipped++;
    continue;
  }

  // Extract validation code (from validationStart to end)
  const validationLines = lines.slice(validationStart);
  const modelLines = lines.slice(0, validationStart);

  // Collect all export names from the validation section
  const exportNames = [];
  for (const line of validationLines) {
    const match = line.match(/^export const (\w+)\s*=/);
    if (match) {
      exportNames.push(match[1]);
    }
  }

  if (exportNames.length === 0) {
    console.log(
      `⚠  ${fileName}: no named exports in validation section, skipping`
    );
    skipped++;
    continue;
  }

  // Build the validator file content
  const validatorContent = [
    'import Joi from "joi";',
    "",
    ...validationLines,
    "", // ensure trailing newline
  ].join("\n");

  // Build re-export line for the model file
  const reExportLine = `\n// Validators extracted to src/validators/${validatorFileName}\nexport { ${exportNames.join(", ")} } from "../validators/${validatorFileName}";\n`;

  // Remove Joi import from model file if it's only used by validators
  // Check if any line in the remaining model code (after removing validators) uses Joi
  const remainingModelContent = modelLines.join("\n");
  const joiUsedInModel = remainingModelContent
    .replace(/^import.*joi.*$/gm, "")
    .includes("Joi");

  let newModelLines = [...modelLines];
  if (!joiUsedInModel) {
    // Remove the Joi import line
    newModelLines = newModelLines.filter(
      (line) => !line.match(/^import\s+Joi\s+from\s+["']joi["']/)
    );
  }

  // Add the re-export at the end of the model file
  const newModelContent = newModelLines.join("\n") + reExportLine;

  // Write validator file
  fs.writeFileSync(validatorPath, validatorContent, "utf8");

  // Write updated model file
  fs.writeFileSync(modelPath, newModelContent, "utf8");

  created++;
  console.log(
    `✓ ${fileName} → ${validatorFileName} (${exportNames.length} exports: ${exportNames.join(", ")})`
  );
}

console.log(`\n=== Summary ===`);
console.log(`Created: ${created} validator files`);
console.log(`Skipped: ${skipped}`);
