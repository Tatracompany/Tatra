import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function loadSeedModule(filePath, exportName) {
  const code = fs.readFileSync(filePath, 'utf8');
  const context = { console, window: {} };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window[exportName] || {};
}

export function loadAppContext(projectRoot) {
  const srcDataDir = path.join(projectRoot, 'src', 'data');
  const appConfig = loadSeedModule(path.join(srcDataDir, 'app-config.js'), '__LANDLORD_APP_CONFIG__');
  const appSeeds = loadSeedModule(path.join(srcDataDir, 'app-seed-data.js'), '__LANDLORD_APP_SEEDS__');
  const hawaliSeeds = loadSeedModule(path.join(srcDataDir, 'hawali-seeds.generated.js'), '__hawaliSeedImports');
  const extraSeeds = loadSeedModule(path.join(srcDataDir, 'extra-seeds.generated.js'), '__extraSeedImports');

  return {
    appConfig,
    appSeeds,
    hawaliTemplates: Array.isArray(hawaliSeeds) ? hawaliSeeds : [],
    extraTemplates: Array.isArray(extraSeeds) ? extraSeeds : [],
    salmiyaTemplates: Array.isArray(appSeeds.SALMIYA_BUILDING_TEMPLATES) ? appSeeds.SALMIYA_BUILDING_TEMPLATES : []
  };
}
