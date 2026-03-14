import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDatabaseFileExists, getDefaultDatabasePath, openDatabase, prepareDatabase } from './lib/database.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');
const databasePath = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : getDefaultDatabasePath(projectRoot);

ensureDatabaseFileExists(projectRoot, databasePath);
prepareDatabase(databasePath, schemaPath);
const database = openDatabase(databasePath);
database.exec(`
  INSERT INTO app_meta(key, value)
  VALUES ('schema_initialized_at', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`);
database.close();

console.log(`Initialized database at ${databasePath}`);
