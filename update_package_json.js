const fs = require('fs');
const path = require('path');

// List of package.json files to update (excluding node_modules)
const packageJsonFiles = [
  './package.json',
  './packages/core/package.json',
  './packages/plugins/token/package.json',
  './packages/plugins/bridge/package.json',
  './packages/plugins/swap/package.json',
  './packages/plugins/knowledge/package.json',
  './packages/plugins/staking/package.json',
  './packages/plugins/wallet/package.json',
  './packages/providers/okx/package.json',
  './packages/providers/thena/package.json',
  './packages/providers/birdeye/package.json',
  './packages/providers/venus/package.json',
  './packages/providers/jupiter/package.json',
  './packages/providers/four-meme/package.json',
  './packages/providers/oku/package.json',
  './packages/providers/pancakeswap/package.json',
  './packages/providers/bink/package.json',
  './packages/providers/kyber/package.json',
  './packages/providers/rpc/package.json',
  './packages/providers/deBridge/package.json',
  './packages/adapters/postgres/package.json',
];

// Fields to add
const repoField = {
  repository: {
    type: 'git',
    url: 'https://github.com/Bink-AI/BinkOS',
  },
};
const homepageField = { homepage: 'https://bink.ai/' };
const standardFiles = {
  files: ['dist', 'README.md', 'LICENSE'],
};
const publishConfigField = {
  publishConfig: {
    access: 'public',
  },
};

// Special cases - packages that need special handling
const specialCases = {
  './package.json': { skipPublishConfig: true, skipFiles: true }, // Root package
  './packages/adapters/postgres/package.json': {
    customFiles: {
      files: ['dist', 'migration.sql'],
    },
  },
};

// Process each file
packageJsonFiles.forEach(filePath => {
  try {
    // Read the package.json file
    const packageJsonContent = fs.readFileSync(filePath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);

    // Add or update the repository and homepage fields
    packageJson.repository = repoField.repository;
    packageJson.homepage = homepageField.homepage;

    // Check if this is a special case
    const specialCase = specialCases[filePath] || {};

    // Add or update files field (unless it's a special case with customFiles)
    if (specialCase.customFiles) {
      packageJson.files = specialCase.customFiles.files;
    } else if (!specialCase.skipFiles && !packageJson.files) {
      packageJson.files = standardFiles.files;
    }

    // Add or update publishConfig field
    if (!specialCase.skipPublishConfig && !packageJson.publishConfig) {
      packageJson.publishConfig = publishConfigField.publishConfig;
    }

    // Write the updated package.json back to the file with proper formatting
    fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');

    console.log(`Updated ${filePath}`);
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error.message);
  }
});

console.log('All package.json files have been updated.');
