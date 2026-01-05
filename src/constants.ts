import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

export const OUTPUT_PATH = join(root, 'output');
export const SAINTCOINACH_PATH = join(root, 'tools', 'SaintCoinach');
