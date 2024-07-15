import fs from 'fs';
import path from 'path';
import arg from 'arg';
import { groupBy } from 'ramda';

import type { PostEventPayload } from '@openpanel/sdk';

import { importFiles } from './importer_v2';

const BATCH_SIZE = 10000; // Define your batch size
const SLEEP_TIME = 100; // Define your sleep time between batches

function progress(value: string) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(value);
}

function stripMixpanelProperties(obj: Record<string, unknown>) {
  const properties = ['time', 'distinct_id'];
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (key.match(/^(\$|mp_)/) || properties.includes(key)) {
      continue;
    }
    result[key] = obj[key];
  }
  return result;
}

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

function parseFileContent(fileContent: string): {
  event: string;
  properties: {
    time: number;
    distinct_id?: string | number;
    [key: string]: unknown;
  };
}[] {
  try {
    return JSON.parse(fileContent);
  } catch (error) {
    const lines = fileContent.trim().split('\n');
    return lines
      .map((line, index) => {
        const json = safeParse(line);
        if (!json) {
          console.log('Warning: Failed to parse JSON');
          console.log('Index:', index);
          console.log('Line:', line);
        }
        return json;
      })
      .filter(Boolean);
  }
}

export default function importer() {
  const args = arg(
    {
      '--glob': String,
    },
    {
      permissive: true,
    }
  );

  if (!args['--glob']) {
    throw new Error('Missing --glob argument');
  }

  const cwd = process.cwd();

  const filePath = path.resolve(cwd, args['--glob']);

  return importFiles(filePath);
}
