import fs from 'fs';
import path from 'path';
import { readProjectMd, writeProjectMd, getProjectName, getProjectPath } from '../core/storage';

/**
 * relay checkpoint <message> — Save a named snapshot of current context.
 *
 * Flow:
 * 1. Read current PROJECT.md
 * 2. Create snapshot file: E:/relay/projects/{name}/snapshots/{timestamp}-{message}.md
 * 3. Append checkpoint entry to PROJECT.md under "## Checkpoints"
 * 4. Success message
 */
export async function checkpointCommand(
  message?: string,
  options?: { list?: boolean }
): Promise<void> {
  const projectName = getProjectName();
  const projectPath = getProjectPath();

  if (!fs.existsSync(projectPath)) {
    console.log('❌ Relay not initialized for this project. Run `relay init` first.');
    process.exit(1);
  }

  const snapshotsDir = path.join(projectPath, 'snapshots');

  if (options?.list) {
    if (!fs.existsSync(snapshotsDir)) {
      console.log('No checkpoints found.');
      return;
    }
    const files = fs.readdirSync(snapshotsDir);
    const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
    if (mdFiles.length === 0) {
      console.log('No checkpoints found.');
      return;
    }
    console.log(`\n💾 Saved checkpoints for "${projectName}":\n`);
    mdFiles.forEach((file) => {
      // Filename format: YYYY-MM-DDTHH-MM-SS-message.md
      const parts = file.slice(0, -3).split('-');
      if (parts.length >= 6) {
        const date = `${parts[0]}-${parts[1]}-${parts[2]}`;
        const time = `${parts[3]}:${parts[4]}`;
        // The message starts after the timestamp. 
        // e.g. 2026-06-16T05-30-22-some-message -> parts are:
        // 0: 2026, 1: 06, 2: 16T05, 3: 30, 4: 22, 5: some, 6: message... wait, split by '-'
        // Let's print the filename or parse it properly
        // Let's parse timestamp correctly
        const datetimePart = file.slice(0, 19); // 2026-06-16T05-30-22
        const dateStr = datetimePart.split('T')[0];
        const timeStr = datetimePart.split('T')[1]?.replace(/-/g, ':') || '';
        const msgStr = file.slice(20, -3).replace(/-/g, ' ');
        console.log(`  [${dateStr} ${timeStr}] "${msgStr}"`);
      } else {
        console.log(`  ${file}`);
      }
    });
    console.log('');
    return;
  }

  if (!message) {
    console.log('❌ Error: Checkpoint message is required.');
    process.exit(1);
  }

  const projectMd = readProjectMd();
  if (!projectMd) {
    console.log('❌ PROJECT.md is empty. Run `relay sync` first.');
    process.exit(1);
  }

  // 1. Build timestamp
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // 2024-01-15
  const timeStr = now.toTimeString().slice(0, 5);   // 14:32
  const fileTimestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // 2024-01-15T14-32-00

  // 2. Create snapshot file
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const sanitizedMessage = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const snapshotFilename = `${fileTimestamp}-${sanitizedMessage}.md`;
  const snapshotPath = path.join(snapshotsDir, snapshotFilename);

  const snapshotContent = `# Checkpoint: ${message}\n\n` +
    `> Saved: ${dateStr} ${timeStr}\n` +
    `> Project: ${projectName}\n\n` +
    `---\n\n` +
    projectMd;

  fs.writeFileSync(snapshotPath, snapshotContent, 'utf-8');

  // 3. Append checkpoint to PROJECT.md
  const checkpointEntry = `- [${dateStr} ${timeStr}] "${message}"`;

  let updatedMd: string;
  if (projectMd.includes('## Checkpoints')) {
    // Append to existing checkpoints section
    updatedMd = projectMd.replace(
      /(## Checkpoints\n)([\s\S]*?)(\n##|\n---|\s*$)/,
      (match, heading, existing, after) => {
        return `${heading}${existing.trimEnd()}\n${checkpointEntry}\n${after}`;
      }
    );

    // If the regex didn't match (e.g. checkpoints is the last section), try simpler append
    if (updatedMd === projectMd) {
      updatedMd = projectMd.trimEnd() + `\n${checkpointEntry}\n`;
    }
  } else {
    // Add new checkpoints section
    updatedMd = projectMd.trimEnd() + `\n\n## Checkpoints\n\n${checkpointEntry}\n`;
  }

  writeProjectMd(updatedMd);

  // Update meta.json
  const metaPath = path.join(projectPath, 'meta.json');
  let meta: Record<string, string | null> = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      // ignore
    }
  }
  meta.name = projectName;
  meta.lastCheckpoint = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  // 4. Success
  console.log(`\n✅ Checkpoint saved: "${message}"`);
  console.log(`   📄 ${snapshotPath}\n`);
}
