import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const locales = ['en', 'zh-CN', 'zh-TW'];

async function analyzeJsonFiles() {
  const contentRoot = fileURLToPath(new URL('../content', import.meta.url));
  const filesByLocale = new Map();
  let totalFiles = 0;

  for (const locale of locales) {
    const dirPath = join(contentRoot, locale, 'compare');
    const files = await readdir(dirPath);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
    filesByLocale.set(locale, jsonFiles);
    totalFiles += jsonFiles.length;
  }

  console.log(`\nAnalyzing ${totalFiles} compare JSON files across ${locales.length} locales...\n`);

  const structures = [];

  for (const locale of locales) {
    const dirPath = join(contentRoot, locale, 'compare');
    const jsonFiles = filesByLocale.get(locale) ?? [];

    // Read and analyze each JSON file
    for (const filename of jsonFiles) {
      const filePath = join(dirPath, filename);
      try {
        const content = await readFile(filePath, 'utf-8');

        if (!content.trim()) {
          structures.push({
            locale,
            filename,
            rootKeys: [],
            structureKey: 'empty',
            hasContent: false,
            error: 'File is empty',
          });
          continue;
        }

        const data = JSON.parse(content);
        const rootKeys = Object.keys(data).sort();
        const structureKey = rootKeys.join('|');

        structures.push({
          locale,
          filename,
          rootKeys,
          structureKey,
          hasContent: true,
        });
      } catch (error) {
        structures.push({
          locale,
          filename,
          rootKeys: [],
          structureKey: 'error',
          hasContent: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Group files by structure
  const groups = new Map();
  for (const structure of structures) {
    const key = structure.structureKey;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(structure);
  }

  // Display results
  const separator = '='.repeat(80);
  console.log(separator);
  console.log('ALL ROOT KEYS FOUND ACROSS ALL FILES:');
  console.log(separator);

  const allKeys = new Set();
  structures.forEach((s) => {
    s.rootKeys.forEach((k) => allKeys.add(k));
  });

  const sortedKeys = Array.from(allKeys).sort();
  sortedKeys.forEach((key) => {
    const filesWithKey = structures.filter((s) => s.rootKeys.includes(key));
    console.log(`  - ${key.padEnd(30)} (in ${filesWithKey.length} files)`);
  });

  console.log(`\n${separator}`);
  console.log('FILES GROUPED BY STRUCTURE:');
  console.log(separator);

  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  sortedGroups.forEach(([structureKey, files], index) => {
    const fileCount = files.length;
    const plural = fileCount > 1 ? 's' : '';
    console.log(`\nGroup ${index + 1} (${fileCount} file${plural}):`);
    console.log(`   Structure: ${structureKey || '(empty/error)'}`);

    if (files[0].rootKeys.length > 0) {
      console.log(`   Root keys: ${files[0].rootKeys.join(', ')}`);
    }

    console.log('   Files:');
    files.forEach((file) => {
      const status = file.hasContent ? 'OK' : file.error ? 'ERR' : 'EMPTY';
      console.log(`     ${status} ${file.locale}/${file.filename}`);
      if (file.error) {
        console.log(`       Error: ${file.error}`);
      }
    });
  });

  // Validation summary
  console.log(`\n${separator}`);
  console.log('VALIDATION SUMMARY:');
  console.log(separator);

  const validFiles = structures.filter((s) => s.hasContent && !s.error);
  const emptyFiles = structures.filter((s) => !s.hasContent && !s.error);
  const errorFiles = structures.filter((s) => s.error);

  console.log(`  Total files: ${structures.length}`);
  const validCount = validFiles.length;
  const emptyCount = emptyFiles.length;
  const errorCount = errorFiles.length;
  console.log(`  Valid JSON files: ${validCount}`);
  console.log(`  Empty files: ${emptyCount}`);
  console.log(`  Files with errors: ${errorCount}`);

  const expectedFiles = filesByLocale.get('en') ?? [];
  for (const locale of locales.filter((locale) => locale !== 'en')) {
    const files = filesByLocale.get(locale) ?? [];
    const missing = expectedFiles.filter((file) => !files.includes(file));
    const extra = files.filter((file) => !expectedFiles.includes(file));

    if (missing.length || extra.length) {
      console.log(`\n  WARNING: ${locale} file coverage differs from en`);
      if (missing.length) console.log(`     Missing: ${missing.join(', ')}`);
      if (extra.length) console.log(`     Extra: ${extra.join(', ')}`);
    }
  }

  if (validFiles.length > 0) {
    const uniqueStructures = new Set(validFiles.map((s) => s.structureKey));
    const uniqueCount = uniqueStructures.size;
    console.log(`\n  Unique structures: ${uniqueCount}`);

    if (uniqueCount > 1) {
      console.log('\n  WARNING: Files have inconsistent structures!');
      console.log(`     Found ${uniqueCount} different structure(s).`);
    } else {
      console.log('\n  All valid files have consistent structure.');
    }
  }

  // Show structure differences in detail
  if (sortedGroups.length > 1) {
    console.log(`\n${separator}`);
    console.log('STRUCTURE DIFFERENCES:');
    console.log(separator);

    sortedGroups.forEach(([structureKey, files], index) => {
      if (structureKey === 'empty' || structureKey === 'error') return;

      const groupNum = index + 1;
      console.log(`\nGroup ${groupNum} structure:`);
      const sample = files[0];
      sample.rootKeys.forEach((key) => {
        console.log(`  - ${key}`);
      });
    });
  }

  console.log(`\n${separator}\n`);
}

// Run the analysis
analyzeJsonFiles().catch(console.error);
