#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directories containing packages
const packageDirs = [
  'packages/core',
  'packages/adapters',
  'packages/plugins',
  'packages/providers',
];

// Function to process a directory and update package.json
function processDirectory(dir) {
  // Check if it's a direct package directory
  const packageJsonPath = path.join(dir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    updatePackageJson(packageJsonPath);
    return;
  }

  // Otherwise, list subdirectories and process each
  try {
    const subdirs = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(dir, dirent.name));

    for (const subdir of subdirs) {
      const subPackageJsonPath = path.join(subdir, 'package.json');
      if (fs.existsSync(subPackageJsonPath)) {
        updatePackageJson(subPackageJsonPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error);
  }
}

// Function to update the package.json file
function updatePackageJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const pkg = JSON.parse(content);

    if (!pkg.license) {
      pkg.license = 'MIT';

      // Find the position to insert the license field (after version)
      const updatedContent = JSON.stringify(pkg, null, 2);

      fs.writeFileSync(filePath, updatedContent);
      console.log(`✅ Added MIT license to ${filePath}`);
    } else {
      console.log(`ℹ️ License already exists in ${filePath}`);
    }
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error);
  }
}

// Process each package directory
packageDirs.forEach(processDirectory);

console.log('License update completed!');
