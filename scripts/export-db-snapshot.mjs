import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDatabaseFileExists, getDefaultDatabasePath, prepareDatabase } from './lib/database.mjs';
import { buildBrowserSnapshotScript, readDatabaseSnapshot } from './lib/db-snapshot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const databasePath = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : getDefaultDatabasePath(projectRoot);
const outputPath = path.join(projectRoot, 'src', 'data', 'db-state.generated.js');

async function main() {
  ensureDatabaseFileExists(projectRoot, databasePath);
  await prepareDatabase(databasePath, path.join(projectRoot, 'db', 'schema.sql'));
  const snapshot = await readDatabaseSnapshot(databasePath);
  const content = buildBrowserSnapshotScript(snapshot);

  fs.writeFileSync(outputPath, content, 'utf8');

  console.log(`Exported DB snapshot to ${outputPath}`);
}

await main();
