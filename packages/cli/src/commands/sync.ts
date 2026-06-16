import { scanProject, ProjectScan, GitContext } from '../core/scanner';
import { readProjectMd, writeProjectMd, getProjectName, getProjectPath } from '../core/storage';
import fs from 'fs';
import path from 'path';

/**
 * Format GitContext data into a markdown string.
 */
function formatGitSection(git: GitContext): string {
  if (!git.isGitRepo) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`- **Branch:** ${git.currentBranch || 'unknown'}`);
  lines.push(`- **Last Commit:** ${git.lastCommitHash ? `\`${git.lastCommitHash.slice(0, 7)}\`` : 'none'}`);

  lines.push('\n### Uncommitted changes');
  if (git.uncommittedChanges.length === 0) {
    lines.push('Uncommitted changes: (clean)');
  } else {
    git.uncommittedChanges.forEach((change) => {
      lines.push(`- \`${change.file}\` (${change.status}) | +${change.additions} -${change.deletions}`);
    });
  }

  if (git.stagedFiles.length > 0) {
    lines.push('\n### Staged files');
    git.stagedFiles.forEach((file) => {
      lines.push(`- \`${file}\``);
    });
  }

  if (git.recentCommits.length > 0) {
    lines.push('\n### Recent commits');
    git.recentCommits.forEach((commit) => {
      lines.push(`- \`${commit.hash}\` (${commit.timeAgo}) - ${commit.message}`);
      if (commit.filesChanged.length > 0) {
        lines.push(`  _Changed:_ ${commit.filesChanged.map((f) => `\`${f}\``).join(', ')}`);
      }
    });
  }

  return '\n' + lines.join('\n');
}

/**
 * Sections that are auto-updated by sync.
 * These are regenerated from the scan data.
 */
const AUTO_SECTIONS = new Set([
  'File structure',
  'Tech stack',
]);

/**
 * Sections that are human-written and never overwritten by sync.
 */
const PROTECTED_SECTIONS = new Set([
  "What we're building",
  'Conventions',
  "What's next",
  "What we're NOT building",
]);

/**
 * Parse PROJECT.md into sections by ## headings.
 */
function parseSections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = md.split('\n');
  let currentHeading = '__preamble__';
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      sections.set(currentHeading, currentLines.join('\n').trimEnd());
      currentHeading = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  sections.set(currentHeading, currentLines.join('\n').trimEnd());

  return sections;
}

/**
 * Render a ProjectScan as a file structure section.
 */
function renderFileStructure(scan: ProjectScan): string {
  let content = '\n```\n' + scan.structure + '\n```\n';

  // File counts
  const counts = Object.entries(scan.fileCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, count]) => `  ${ext}: ${count}`)
    .join('\n');
  content += `\n**File counts:**\n${counts}`;

  return content;
}

/**
 * Render tech stack section.
 */
function renderTechStack(scan: ProjectScan): string {
  return '\n' + scan.techStack.map((t) => `- ${t}`).join('\n');
}

/**
 * Render "What's in progress" section from recently modified files.
 */
function renderInProgress(scan: ProjectScan, existing: string): string {
  const recentFiles = scan.recentlyModified
    .map((f) => `- \`${f}\``)
    .join('\n');

  // Strip out any previously generated "Recently modified:" section
  const cleanedExisting = existing.replace(/\*\*Recently modified:\*\*[\s\S]*/i, '').trim();

  // Keep any existing human-written content and append recent changes
  const lines: string[] = [];
  if (cleanedExisting) {
    lines.push(cleanedExisting);
  }
  lines.push(`\n**Recently modified:**\n${recentFiles}`);

  return '\n' + lines.join('\n');
}

/**
 * relay sync — Scan project and update context.
 *
 * Flow:
 * 1. Scan the project directory
 * 2. Read existing PROJECT.md
 * 3. Update auto-generated sections, preserve human-written ones
 * 4. Write updated PROJECT.md
 * 5. Show diff summary
 */
export async function syncCommand(): Promise<void> {
  const projectName = getProjectName();
  const projectPath = getProjectPath();

  if (!fs.existsSync(projectPath)) {
    console.log('❌ Relay not initialized for this project. Run `relay init` first.');
    process.exit(1);
  }

  console.log(`\n🔄 Syncing "${projectName}"...\n`);

  // 1. Scan
  const scan = await scanProject(process.cwd());

  // 2. Read existing PROJECT.md
  let existingMd = readProjectMd();
  // Strip any historical/duplicated sync footers
  existingMd = existingMd.replace(/\n*---\n*_Last synced:[0-9: \-_]+_\s*/gi, '').trimEnd();
  
  const sections = parseSections(existingMd);

  // 3. Update sections
  const updated: string[] = [];

  // Track what changed
  const changes: string[] = [];

  // Preamble (title etc.)
  if (sections.has('__preamble__')) {
    updated.push(sections.get('__preamble__')!);
  }

  // Update timestamp in preamble
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Rebuild the document section by section
  const sectionOrder = [
    "What we're building",
    'Tech stack',
    'Git context',
    "What's in progress",
    "What's next",
    'Conventions',
    'File structure',
    "What's working",
    "What we're NOT building",
    'Checkpoints',
  ];

  for (const heading of sectionOrder) {
    const existing = sections.get(heading) || '';

    if (heading === 'File structure') {
      updated.push(`## File structure\n${renderFileStructure(scan)}`);
      changes.push('file structure');
    } else if (heading === 'Tech stack') {
      updated.push(`## Tech stack\n${renderTechStack(scan)}`);
      changes.push('tech stack');
    } else if (heading === "What's in progress") {
      updated.push(`## What's in progress\n${renderInProgress(scan, existing)}`);
      changes.push('recently modified');
    } else if (heading === 'Git context') {
      const gitContent = formatGitSection(scan.gitContext);
      if (gitContent) {
        updated.push(`## Git context\n${gitContent}`);
        changes.push('git context');
      }
    } else if (existing || sections.has(heading)) {
      // Keep human-written sections as-is
      updated.push(`## ${heading}\n${existing}`);
    }
  }

  // Add any extra sections not in our known order
  for (const [heading, content] of sections) {
    if (heading === '__preamble__') continue;
    if (sectionOrder.includes(heading)) continue;
    updated.push(`## ${heading}\n${content}`);
  }

  // Append sync timestamp
  const footer = `\n\n---\n_Last synced: ${timestamp}_`;

  // 4. Write
  writeProjectMd(updated.join('\n\n') + footer + '\n');

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
  meta.cwd = process.cwd();
  meta.lastSync = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  // 5. Report
  console.log(`✅ Sync complete for "${projectName}"`);
  console.log(`   Updated: ${changes.join(', ')}`);
  console.log(`   📁 ${projectPath}\n`);
}
