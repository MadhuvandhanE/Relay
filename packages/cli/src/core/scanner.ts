import path from 'path';
import fs from 'fs';
import ignore, { Ignore } from 'ignore';
import { glob } from 'glob';
import { execSync } from 'child_process';

export interface GitContext {
  isGitRepo: boolean;
  currentBranch: string | null;
  recentCommits: Array<{ hash: string; message: string; timeAgo: string; filesChanged: string[] }>;
  uncommittedChanges: Array<{ file: string; status: string; additions: number; deletions: number }>;
  stagedFiles: string[];
  lastCommitHash: string | null;
}

/**
 * Structured result of a project scan.
 */
export interface ProjectScan {
  name: string;
  structure: string;          // formatted folder tree
  dependencies: string[];     // from package.json
  techStack: string[];        // inferred from deps + file types
  recentlyModified: string[]; // last 5 changed files
  fileCount: Record<string, number>; // { '.ts': 24, '.json': 3 }
  gitContext: GitContext;
}

/** Directories that are always skipped, regardless of .gitignore */
const ALWAYS_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'coverage',
]);

/**
 * Load .gitignore patterns from the project root.
 */
function loadGitignore(cwd: string): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  }
  // Always ignore these regardless
  ALWAYS_SKIP.forEach((dir) => ig.add(dir));
  return ig;
}

/**
 * Build a formatted folder tree string, 2 levels deep.
 */
function buildTree(cwd: string, ig: Ignore, maxDepth = 2): string {
  const lines: string[] = [];

  function walk(dir: string, prefix: string, depth: number) {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort: directories first, then files, both alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const filtered = entries.filter((entry) => {
      const rel = path.relative(cwd, path.join(dir, entry.name));
      const relPosix = rel.split(path.sep).join('/');
      if (ALWAYS_SKIP.has(entry.name)) return false;
      if (ig.ignores(relPosix + (entry.isDirectory() ? '/' : ''))) return false;
      return true;
    });

    filtered.forEach((entry, idx) => {
      const isLast = idx === filtered.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';
      const icon = entry.isDirectory() ? '📁 ' : '';
      lines.push(`${prefix}${connector}${icon}${entry.name}`);

      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), prefix + childPrefix, depth + 1);
      }
    });
  }

  lines.push(path.basename(cwd) + '/');
  walk(cwd, '', 1);
  return lines.join('\n');
}

/**
 * Find all package.json files recursively and extract dependency names.
 */
function extractDependencies(cwd: string, ig: Ignore): string[] {
  const deps = new Set<string>();

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ALWAYS_SKIP.has(entry.name)) continue;
      const rel = path.relative(cwd, path.join(dir, entry.name));
      const relPosix = rel.split(path.sep).join('/');
      if (ig.ignores(relPosix + (entry.isDirectory() ? '/' : ''))) continue;

      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf-8'));
          for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (pkg[key]) {
              Object.keys(pkg[key]).forEach((d) => deps.add(d));
            }
          }
        } catch {
          // Ignore invalid package.json
        }
      }
    }
  }

  walk(cwd);
  return Array.from(deps).sort();
}

/**
 * Infer tech stack from dependencies and file extensions.
 */
function inferTechStack(
  deps: string[],
  fileExtensions: Record<string, number>
): string[] {
  const stack: string[] = [];

  // From dependencies
  const depSet = new Set(deps.map((d) => d.toLowerCase()));
  if (depSet.has('react') || depSet.has('react-dom')) stack.push('React');
  if (depSet.has('next')) stack.push('Next.js');
  if (depSet.has('vue')) stack.push('Vue');
  if (depSet.has('svelte')) stack.push('Svelte');
  if (depSet.has('express')) stack.push('Express');
  if (depSet.has('fastify')) stack.push('Fastify');
  if (depSet.has('commander')) stack.push('Commander.js');
  if (depSet.has('inquirer')) stack.push('Inquirer');
  if (depSet.has('chalk')) stack.push('Chalk');
  if (depSet.has('@types/vscode')) stack.push('VS Code Extension API');
  if (depSet.has('electron')) stack.push('Electron');
  if (depSet.has('tailwindcss')) stack.push('Tailwind CSS');
  if (depSet.has('@anthropic-ai/sdk')) stack.push('Anthropic SDK');
  if (depSet.has('openai')) stack.push('OpenAI SDK');
  if (depSet.has('prisma') || depSet.has('@prisma/client')) stack.push('Prisma');

  // From file types
  if (fileExtensions['.ts'] || fileExtensions['.tsx']) stack.push('TypeScript');
  if (fileExtensions['.py']) stack.push('Python');
  if (fileExtensions['.rs']) stack.push('Rust');
  if (fileExtensions['.go']) stack.push('Go');
  if (fileExtensions['.java']) stack.push('Java');
  if (fileExtensions['.css'] || fileExtensions['.scss']) stack.push('CSS');

  // Deduplicate while preserving order
  return [...new Set(stack)];
}

/**
 * Scan the current working directory and extract structured project info.
 */
export async function scanProject(cwd: string): Promise<ProjectScan> {
  const ig = loadGitignore(cwd);

  // Build folder tree (2 levels deep)
  const structure = buildTree(cwd, ig);

  // Extract dependencies from package.json files
  const dependencies = extractDependencies(cwd, ig);

  // Find all files, respecting .gitignore and skip list
  const allFiles = await glob('**/*', {
    cwd,
    nodir: true,
    dot: false,
    ignore: [...ALWAYS_SKIP].map((d) => `**/${d}/**`),
  });

  const filteredFiles = allFiles.filter((f) => !ig.ignores(f));

  // Count files by extension
  const fileCount: Record<string, number> = {};
  for (const file of filteredFiles) {
    const ext = path.extname(file) || '(no ext)';
    fileCount[ext] = (fileCount[ext] || 0) + 1;
  }

  // Recently modified files (last 5 by mtime)
  const withStats = filteredFiles
    .map((file) => {
      try {
        const stat = fs.statSync(path.join(cwd, file));
        return { file, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((s): s is { file: string; mtime: number } => s !== null);

  withStats.sort((a, b) => b.mtime - a.mtime);
  const recentlyModified = withStats.slice(0, 5).map((s) => s.file);

  // Infer tech stack
  const techStack = inferTechStack(dependencies, fileCount);

  // Project name
  const pkgPath = path.join(cwd, 'package.json');
  let name = path.basename(cwd);
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) {
        name = pkg.name.replace(/^@[^/]+\//, '');
      }
    } catch {
      // use folder name
    }
  }

  return {
    name,
    structure,
    dependencies,
    techStack,
    recentlyModified,
    fileCount,
    gitContext: scanGitContext(cwd),
  };
}

/**
 * Reads live git data from the current working directory.
 * Never throws or crashes if git is not installed or the directory is not a git repo.
 */
export function scanGitContext(cwd: string): GitContext {
  const fallback: GitContext = {
    isGitRepo: false,
    currentBranch: null,
    recentCommits: [],
    uncommittedChanges: [],
    stagedFiles: [],
    lastCommitHash: null,
  };

  try {
    // 1. Check if cwd is a git repo
    execSync(`git -C "${cwd}" rev-parse --is-inside-work-tree`, { stdio: 'ignore' });
  } catch {
    return fallback;
  }

  try {
    // Branch
    let currentBranch: string | null = null;
    try {
      currentBranch = execSync(`git -C "${cwd}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf-8' }).trim();
    } catch {
      // maybe detached HEAD or fresh repo
    }

    // Last commit hash
    let lastCommitHash: string | null = null;
    try {
      lastCommitHash = execSync(`git -C "${cwd}" rev-parse HEAD`, { encoding: 'utf-8' }).trim();
    } catch {
      // maybe no commits yet
    }

    // Recent commits (last 7)
    const recentCommits: GitContext['recentCommits'] = [];
    if (lastCommitHash) {
      try {
        const logOut = execSync(
          `git -C "${cwd}" log --oneline --no-merges -7 --format="%h|||%s|||%ar|||%P"`,
          { encoding: 'utf-8' }
        );
        const logLines = logOut.split('\n').filter(Boolean);
        for (const line of logLines) {
          const parts = line.split('|||');
          if (parts.length >= 3) {
            const hash = parts[0].trim();
            const message = parts[1].trim();
            const timeAgo = parts[2].trim();

            // Files changed per commit
            let filesChanged: string[] = [];
            try {
              const diffTreeOut = execSync(
                `git -C "${cwd}" diff-tree --no-commit-id -r --name-only ${hash}`,
                { encoding: 'utf-8' }
              );
              const files = diffTreeOut.split('\n').filter(Boolean);
              if (files.length > 5) {
                filesChanged = files.slice(0, 4).concat([`and ${files.length - 4} more`]);
              } else {
                filesChanged = files;
              }
            } catch {
              // ignore
            }

            recentCommits.push({ hash, message, timeAgo, filesChanged });
          }
        }
      } catch {
        // ignore log error (e.g. no commits)
      }
    }

    // Uncommitted changes
    const uncommittedChanges: GitContext['uncommittedChanges'] = [];
    if (lastCommitHash) {
      try {
        const diffOut = execSync(`git -C "${cwd}" diff --numstat HEAD`, { encoding: 'utf-8' });
        const lines = diffOut.split('\n').filter(Boolean);
        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length >= 3) {
            let additions = parseInt(parts[0], 10);
            let deletions = parseInt(parts[1], 10);
            if (isNaN(additions)) additions = 0;
            if (isNaN(deletions)) deletions = 0;
            const file = parts[2].trim();

            // Infer status
            const status = deletions > 0 && additions === 0 ? 'deleted' : (additions > 0 && deletions === 0 ? 'added' : 'modified');
            uncommittedChanges.push({ file, status, additions, deletions });
          }
        }
      } catch {
        // ignore
      }
    }

    // Staged files
    let stagedFiles: string[] = [];
    if (lastCommitHash) {
      try {
        const stagedOut = execSync(`git -C "${cwd}" diff --name-only --cached`, { encoding: 'utf-8' });
        stagedFiles = stagedOut.split('\n').filter(Boolean);
      } catch {
        // ignore
      }
    }

    return {
      isGitRepo: true,
      currentBranch,
      recentCommits,
      uncommittedChanges,
      stagedFiles,
      lastCommitHash,
    };
  } catch {
    return fallback;
  }
}
