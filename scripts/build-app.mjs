import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const srcDir = path.join(root, 'src', 'app');
const dataDir = path.join(root, 'src', 'data');
const outputPath = path.join(root, 'app.js');
const copiedDataFiles = [
  'app-config.js',
  'app-seed-data.js',
  'hawali-seeds.generated.js',
  'extra-seeds.generated.js',
  'db-state.generated.js'
];

function getBuildMetadata() {
  const builtAt = new Date().toISOString();
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString('utf8').trim() || 'unknown';
  } catch (_error) {
    // Ignore git metadata failures and keep a safe fallback.
  }
  return { commit, builtAt };
}

const orderedFiles = [
  '00-header.js',
  '10-utils.js',
  '11-seed-state.js',
  '12-auth.js',
  '13-ledger.js',
  '14-admin-shared.js',
  '20-dashboard.js',
  '30-buildings-view.js',
  '31-buildings-detail.js',
  '32-buildings-actions.js',
  '40-tenants.js',
  '41-history.js',
  '50-due-vacant.js',
  '51-tenant-tracker.js',
  '60-forms.js',
  '70-shell.js'
];

const missing = orderedFiles.filter((file) => !fs.existsSync(path.join(srcDir, file)));
if (missing.length) {
  console.error(`Missing source files:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  process.exit(1);
}

const banner = '// Generated from src/app/* by scripts/build-app.mjs\n';
const content = banner + orderedFiles
  .map((file) => fs.readFileSync(path.join(srcDir, file), 'utf8').replace(/^\uFEFF/, '').trimEnd())
  .join('\n\n') + '\n';

fs.writeFileSync(outputPath, content, 'utf8');
const buildMetadata = getBuildMetadata();
copiedDataFiles.forEach((file) => {
  const sourcePath = path.join(dataDir, file);
  const targetPath = path.join(root, file);
  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing data file: ${file}`);
    process.exit(1);
  }
  let fileContent = fs.readFileSync(sourcePath, 'utf8');
  if (file === 'app-config.js') {
    fileContent = fileContent
      .replace(/__BUILD_COMMIT__/g, buildMetadata.commit)
      .replace(/__BUILD_TIME__/g, buildMetadata.builtAt);
  }
  fs.writeFileSync(targetPath, fileContent, 'utf8');
});

console.log(`Built app.js and copied ${copiedDataFiles.length} data files.`);
