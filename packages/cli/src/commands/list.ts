import fs from 'fs';
import path from 'path';
import { getRelayRoot } from '../core/storage';

interface ProjectMeta {
  name: string;
  cwd: string;
  lastSync: string | null;
  lastCheckpoint: string | null;
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never synced';
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return 'never synced';

  const now = Date.now();
  const diffMs = now - parsed;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 0) {
    return 'just now';
  }
  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export async function listCommand(): Promise<void> {
  const chalk = (await import('chalk')).default;
  const relayRoot = getRelayRoot();
  const projectsDir = path.join(relayRoot, 'projects');

  if (!fs.existsSync(projectsDir)) {
    console.log('No tracked projects found.');
    return;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch (err) {
    console.log('❌ Error: Could not read projects directory.');
    process.exit(1);
  }

  const projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (projectDirs.length === 0) {
    console.log('No tracked projects found.');
    return;
  }

  const projectsInfo = projectDirs.map((dirName) => {
    const projectPath = path.join(projectsDir, dirName);
    const metaPath = path.join(projectPath, 'meta.json');
    let meta: ProjectMeta;

    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {
        meta = { name: dirName, cwd: '', lastSync: null, lastCheckpoint: null };
      }
    } else {
      meta = { name: dirName, cwd: '', lastSync: null, lastCheckpoint: null };
    }

    // fallback to dirName if name is empty in meta
    if (!meta.name) {
      meta.name = dirName;
    }

    // Count snapshots/
    const snapshotsDir = path.join(projectPath, 'snapshots');
    let checkpointCount = 0;
    if (fs.existsSync(snapshotsDir)) {
      try {
        const files = fs.readdirSync(snapshotsDir);
        checkpointCount = files.filter((f) => f.endsWith('.md')).length;
      } catch {
        // ignore
      }
    }

    return {
      ...meta,
      projectPath,
      checkpointCount,
    };
  });

  // Sort by lastSync descending (most recently synced first, never-synced at bottom)
  projectsInfo.sort((a, b) => {
    const aTime = a.lastSync ? Date.parse(a.lastSync) : 0;
    const bTime = b.lastSync ? Date.parse(b.lastSync) : 0;
    const aValid = !isNaN(aTime) && a.lastSync !== null;
    const bValid = !isNaN(bTime) && b.lastSync !== null;

    if (!aValid && !bValid) return 0;
    if (!aValid) return 1; // move a to the bottom
    if (!bValid) return -1; // move b to the bottom

    return bTime - aTime;
  });

  console.log(`\n📂 Tracked Relay Projects:\n`);

  for (const proj of projectsInfo) {
    let pathText = proj.cwd || '(unknown)';
    let isMovedOrDeleted = false;

    if (proj.cwd) {
      try {
        if (!fs.existsSync(proj.cwd)) {
          isMovedOrDeleted = true;
        }
      } catch {
        isMovedOrDeleted = true;
      }
    } else {
      isMovedOrDeleted = true;
    }

    const pathStr = isMovedOrDeleted
      ? chalk.yellow(chalk.dim(`${pathText} (moved or deleted)`))
      : chalk.green(pathText);

    const relativeSync = formatRelativeTime(proj.lastSync);
    const relativeCheckpoint = proj.lastCheckpoint ? formatRelativeTime(proj.lastCheckpoint) : null;

    console.log(`  ${chalk.cyan.bold(proj.name)}`);
    console.log(`    ${chalk.gray('Path:')}        ${pathStr}`);
    console.log(`    ${chalk.gray('Last Sync:')}   ${relativeSync}`);
    
    let checkpointInfo = `${proj.checkpointCount} saved`;
    if (proj.checkpointCount > 0 && relativeCheckpoint) {
      checkpointInfo += ` (last: ${relativeCheckpoint})`;
    }
    console.log(`    ${chalk.gray('Checkpoints:')} ${checkpointInfo}`);
    console.log('');
  }
}
