import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface JsonFieldMapping {
  model: string;
  field: string;
  type: string;
}

function parseSchemaForJsonTypes(schemaPath: string): JsonFieldMapping[] {
  const schemaContent = readFileSync(schemaPath, 'utf-8');
  const lines = schemaContent.split('\n');
  const mappings: JsonFieldMapping[] = [];

  let currentModel = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || '';

    // Track current model
    if (line.startsWith('model ')) {
      const parts = line.split(' ');
      currentModel = parts[1] || '';
      continue;
    }

    // Look for Json fields with type comments
    if (line.includes('Json') && i > 0) {
      const prevLine = lines[i - 1]?.trim() || '';
      const typeMatch = prevLine.match(/\/\/\/ \[([^\]]+)\]/);

      if (typeMatch) {
        const fieldMatch = line.match(/(\w+)\s+Json/);
        if (fieldMatch?.[1] && typeMatch[1]) {
          mappings.push({
            model: currentModel,
            field: fieldMatch[1],
            type: typeMatch[1],
          });
        }
      }
    }
  }

  return mappings;
}

function processGeneratedFiles(
  generatedDir: string,
  mappings: JsonFieldMapping[],
): void {
  // Process the main files in the generated directory
  const mainFiles = [
    'client.ts',
    'commonInputTypes.ts',
    'enums.ts',
    'models.ts',
  ];

  for (const fileName of mainFiles) {
    const filePath = join(generatedDir, fileName);
    try {
      replaceJsonValueInFileForModel(filePath, mappings);
    } catch (error) {
      console.log(`Skipping ${filePath}: ${error}`);
    }
  }

  // Process files in the models subdirectory - each file corresponds to one model
  const modelsDir = join(generatedDir, 'models');
  try {
    const modelFiles = readdirSync(modelsDir);
    for (const fileName of modelFiles) {
      if (fileName.endsWith('.ts')) {
        const filePath = join(modelsDir, fileName);
        try {
          // Extract model name from filename (e.g., "Notification.ts" -> "Notification")
          const modelName = fileName.replace('.ts', '');

          // Only process mappings for this specific model
          const modelMappings = mappings.filter((m) => m.model === modelName);

          if (modelMappings.length > 0) {
            replaceJsonValueInFileForModel(filePath, modelMappings);
          }
        } catch (error) {
          console.log(`Skipping ${filePath}: ${error}`);
        }
      }
    }
  } catch (error) {
    console.log(`Could not read models directory: ${error}`);
  }
}

function replaceJsonValueInFileForModel(
  filePath: string,
  mappings: JsonFieldMapping[],
): void {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const mapping of mappings) {
    // Pattern 1: Simple runtime.JsonValue replacement (for select/return types)
    const simpleJsonValueRegex = new RegExp(
      `\\b${mapping.field}:\\s*runtime\\.JsonValue\\b`,
      'g',
    );
    if (simpleJsonValueRegex.test(content)) {
      content = content.replace(
        simpleJsonValueRegex,
        `${mapping.field}: PrismaJson.${mapping.type}`,
      );
      modified = true;
    }

    // Pattern 2: runtime.InputJsonValue with optional JsonNullValueInput (for create/update inputs)
    const inputJsonValueRegex = new RegExp(
      `\\b${mapping.field}:\\s*(?:Prisma\\.JsonNullValueInput\\s*\\|\\s*)?runtime\\.InputJsonValue\\b`,
      'g',
    );
    if (inputJsonValueRegex.test(content)) {
      content = content.replace(
        inputJsonValueRegex,
        `${mapping.field}: PrismaJson.${mapping.type}`,
      );
      modified = true;
    }

    // Pattern 3: Optional runtime.InputJsonValue with optional JsonNullValueInput
    const optionalInputJsonValueRegex = new RegExp(
      `\\b${mapping.field}\\?:\\s*(?:Prisma\\.JsonNullValueInput\\s*\\|\\s*)?runtime\\.InputJsonValue\\b`,
      'g',
    );
    if (optionalInputJsonValueRegex.test(content)) {
      content = content.replace(
        optionalInputJsonValueRegex,
        `${mapping.field}?: PrismaJson.${mapping.type}`,
      );
      modified = true;
    }

    // Pattern 4: Union types with JsonNullValueInput | runtime.InputJsonValue
    const unionJsonValueRegex =
      /(Prisma\.JsonNullValueInput\s*\|\s*)runtime\.InputJsonValue/g;
    if (unionJsonValueRegex.test(content)) {
      content = content.replace(
        unionJsonValueRegex,
        `$1PrismaJson.${mapping.type}`,
      );
      modified = true;
    }

    // Pattern 5: Just runtime.InputJsonValue in unions
    const simpleInputJsonValueRegex = /\|\s*runtime\.InputJsonValue/g;
    if (simpleInputJsonValueRegex.test(content)) {
      content = content.replace(
        simpleInputJsonValueRegex,
        `| PrismaJson.${mapping.type}`,
      );
      modified = true;
    }

    // Pattern 6: Optional union types with JsonNullValueInput | runtime.InputJsonValue
    const optionalUnionJsonValueRegex = new RegExp(
      `\\b${mapping.field}\\?:\\s*(?:Prisma\\.JsonNullValueInput\\s*\\|\\s*)?runtime\\.InputJsonValue\\b`,
      'g',
    );
    if (optionalUnionJsonValueRegex.test(content)) {
      content = content.replace(
        optionalUnionJsonValueRegex,
        `${mapping.field}?: PrismaJson.${mapping.type}`,
      );
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  }
}

function main() {
  const schemaPath = join(__dirname, '../prisma/schema.prisma');
  const generatedDir = join(__dirname, '../src/generated/prisma');

  console.log('Parsing schema for Json type mappings...');
  const mappings = parseSchemaForJsonTypes(schemaPath);

  console.log('Found Json type mappings:');
  mappings.forEach((m) => console.log(`  ${m.model}.${m.field} -> ${m.type}`));

  if (mappings.length === 0) {
    console.log('No mappings found!');
    return;
  }

  console.log('Processing generated files...');
  processGeneratedFiles(generatedDir, mappings);

  console.log('Post-codegen script completed!');
}

main();
