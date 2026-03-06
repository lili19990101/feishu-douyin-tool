const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDist = path.join(rootDir, 'frontend', 'dist');
const backendPublic = path.join(rootDir, 'backend', 'public');
const preservedFiles = new Set(['.gitignore']);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function cleanDir(dirPath) {
  const entries = fs.existsSync(dirPath) ? fs.readdirSync(dirPath, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (preservedFiles.has(entry.name)) {
      continue;
    }
    const targetPath = path.join(dirPath, entry.name);
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(frontendDist)) {
  console.error('frontend/dist not found. Run the frontend build first.');
  process.exit(1);
}

ensureDir(backendPublic);
cleanDir(backendPublic);
copyRecursive(frontendDist, backendPublic);

console.log('Copied frontend/dist into backend/public');
