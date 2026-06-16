import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * OS-aware global storage path.
 * Windows: E:/relay
 * Mac/Linux: ~/.relay
 */
export function getRelayRoot(): string {
  if (process.platform === 'win32') {
    return 'E:/relay';
  }
  return path.join(os.homedir(), '.relay');
}

/**
 * Detect current project name from package.json or folder name.
 */
export function getProjectName(): string {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, 'package.json');

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) {
        // Strip org scope (e.g. @org/name → name)
        const name = pkg.name.replace(/^@[^/]+\//, '');
        return name;
      }
    } catch {
      // Fall through to folder name
    }
  }

  const base = path.basename(cwd);
  if (!base) {
    const driveMatch = cwd.match(/^([A-Za-z]):\\$/);
    if (driveMatch) {
      return driveMatch[1];
    }
    return 'root';
  }
  return base;
}

/**
 * Get the storage path for the current project.
 */
export function getProjectPath(): string {
  return path.join(getRelayRoot(), 'projects', getProjectName());
}

/**
 * Get the path to PROJECT.md for the current project.
 */
export function getProjectMdPath(): string {
  return path.join(getProjectPath(), 'PROJECT.md');
}

/**
 * Read PROJECT.md for the current project.
 * Returns empty string if it doesn't exist.
 */
export function readProjectMd(): string {
  const mdPath = getProjectMdPath();
  if (!fs.existsSync(mdPath)) {
    return '';
  }
  return fs.readFileSync(mdPath, 'utf-8');
}

/**
 * Write PROJECT.md for the current project.
 * Creates the project directory if it doesn't exist.
 */
export function writeProjectMd(content: string): void {
  const projectPath = getProjectPath();
  fs.mkdirSync(projectPath, { recursive: true });
  fs.writeFileSync(getProjectMdPath(), content, 'utf-8');
}

/**
 * Get path to the global config file.
 */
function getConfigPath(): string {
  return path.join(getRelayRoot(), 'config.json');
}

/**
 * Read global config (API key etc.).
 * Returns empty object if config doesn't exist.
 */
export function readConfig(): Record<string, string> {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Write global config.
 * Creates the relay root directory if it doesn't exist.
 */
export function writeConfig(config: Record<string, string>): void {
  const relayRoot = getRelayRoot();
  fs.mkdirSync(relayRoot, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
