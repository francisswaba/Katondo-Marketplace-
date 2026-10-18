import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(sourceDirectory, '../../../.env') });
