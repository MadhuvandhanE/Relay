/**
 * End-to-end test for Relay CLI core modules.
 * Tests storage, scanner, compressor, and all 4 commands (non-interactive).
 */
import fs from 'fs';
import path from 'path';
import {
  getRelayRoot,
  getProjectName,
  getProjectPath,
  getProjectMdPath,
  readProjectMd,
  writeProjectMd,
  readConfig,
  writeConfig,
} from './core/storage';
import { scanProject, ProjectScan } from './core/scanner';
import { truncateContext } from './core/compressor';

// ── Helpers ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

// ── Test: Storage ─────────────────────────────────────────────────
function testStorage() {
  section('Storage Module');

  // getRelayRoot
  const root = getRelayRoot();
  assert('getRelayRoot() returns E:/relay on Windows', root === 'E:/relay' || root.includes('.relay'));
  console.log(`    → root = ${root}`);

  // getProjectName (running from e:\relay, should detect "relay" from root package.json)
  const name = getProjectName();
  assert('getProjectName() detects name from package.json or folder', name.length > 0, `got "${name}"`);
  console.log(`    → name = ${name}`);

  // getProjectPath
  const projPath = getProjectPath();
  assert('getProjectPath() builds correct path', projPath.includes('projects') && projPath.includes(name));
  console.log(`    → path = ${projPath}`);

  // writeProjectMd + readProjectMd
  const testContent = '# Test Project\n\nThis is a test.\n';
  writeProjectMd(testContent);
  const read = readProjectMd();
  assert('writeProjectMd + readProjectMd roundtrip', read === testContent);

  // getProjectMdPath
  const mdPath = getProjectMdPath();
  assert('PROJECT.md file exists on disk', fs.existsSync(mdPath));
  console.log(`    → PROJECT.md at ${mdPath}`);

  // writeConfig + readConfig
  const testConfig = { anthropicApiKey: 'sk-test-key-12345', testFlag: 'hello' };
  writeConfig(testConfig);
  const readConf = readConfig();
  assert('writeConfig + readConfig roundtrip', readConf.anthropicApiKey === 'sk-test-key-12345');
  assert('readConfig preserves all keys', readConf.testFlag === 'hello');

  // Config file exists
  const configPath = path.join(getRelayRoot(), 'config.json');
  assert('config.json exists on disk', fs.existsSync(configPath));
}

// ── Test: Scanner ─────────────────────────────────────────────────
async function testScanner() {
  section('Scanner Module');

  const cwd = path.resolve(__dirname, '../../../'); // monorepo root (e:\relay)
  console.log(`    → scanning: ${cwd}`);

  const scan: ProjectScan = await scanProject(cwd);

  assert('scan.name is detected', scan.name.length > 0, `got "${scan.name}"`);
  assert('scan.structure is non-empty', scan.structure.length > 50, `${scan.structure.length} chars`);
  assert('scan.dependencies is array', Array.isArray(scan.dependencies));
  assert('scan.dependencies has items', scan.dependencies.length > 0, `found ${scan.dependencies.length} deps`);
  assert('scan.techStack inferred', scan.techStack.length > 0, `[${scan.techStack.join(', ')}]`);
  assert('scan.recentlyModified has files', scan.recentlyModified.length > 0, `${scan.recentlyModified.length} files`);
  assert('scan.fileCount has extensions', Object.keys(scan.fileCount).length > 0);

  // Check .gitignore / skip list is working
  assert('node_modules excluded from structure', !scan.structure.includes('node_modules'));
  assert('.git excluded from structure', !scan.structure.includes('.git/'));

  // Print a sample of what was found
  console.log(`\n    📁 Structure (first 10 lines):`);
  scan.structure.split('\n').slice(0, 10).forEach((l) => console.log(`       ${l}`));

  console.log(`\n    📦 Dependencies (first 5):`);
  scan.dependencies.slice(0, 5).forEach((d) => console.log(`       - ${d}`));

  console.log(`\n    🔧 Tech Stack: ${scan.techStack.join(', ')}`);

  console.log(`\n    📝 Recently Modified:`);
  scan.recentlyModified.forEach((f) => console.log(`       - ${f}`));

  console.log(`\n    📊 File Counts:`);
  Object.entries(scan.fileCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([ext, count]) => console.log(`       ${ext}: ${count}`));
}

// ── Test: Compressor (fallback only, no API key needed) ───────────
function testCompressor() {
  section('Compressor Module (fallback truncation)');

  const sampleMd = `# My Project

> Relay context

## What we're building

A CLI tool for persistent AI context management.

## Tech stack

- TypeScript
- Node.js
- Commander

## What's in progress

Working on the scanner module.

## What's next

- Add tests
- Polish the VS Code extension

## Conventions

- Use functional style
- Keep modules small
- Use descriptive variable names

## File structure

\`\`\`
relay/
├── packages/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   └── core/
│   │   └── package.json
│   └── vscode-extension/
└── package.json
\`\`\`

## What's working

- Init command
- Storage module

## Checkpoints

- [2024-01-15 14:32] "initial scaffold"
- [2024-01-16 10:00] "scanner done"
`;

  const truncated = truncateContext(sampleMd);
  assert('truncateContext returns non-empty string', truncated.length > 0);
  assert('truncated is shorter than original', truncated.length <= sampleMd.length, 
    `${truncated.length} vs ${sampleMd.length}`);
  assert('truncated keeps "What we\'re building"', truncated.includes("What we're building"));
  assert('truncated keeps "Tech stack"', truncated.includes('Tech stack'));
  assert('truncated keeps "What\'s in progress"', truncated.includes("What's in progress"));
  assert('truncated keeps "What\'s next"', truncated.includes("What's next"));
  assert('Checkpoints section is dropped', !truncated.includes('Checkpoints'));

  console.log(`\n    Truncated output (${truncated.length} chars):`);
  console.log('    ─'.repeat(30));
  truncated.split('\n').forEach((l) => console.log(`    ${l}`));
}

// ── Test: Checkpoint Command (programmatic) ───────────────────────
async function testCheckpoint() {
  section('Checkpoint Command');

  // First write a proper PROJECT.md
  const projectMd = `# relay

> Relay context

## What we're building

A CLI tool for persistent AI context.

## Tech stack

- TypeScript
- Node.js

## What's in progress

Working on tests.
`;

  writeProjectMd(projectMd);

  // Import and run checkpoint
  const { checkpointCommand } = await import('./commands/checkpoint');
  await checkpointCommand('test-checkpoint-alpha');

  // Verify snapshot was created
  const snapshotsDir = path.join(getProjectPath(), 'snapshots');
  assert('snapshots directory exists', fs.existsSync(snapshotsDir));

  const snapshots = fs.readdirSync(snapshotsDir);
  const testSnapshot = snapshots.find((f) => f.includes('test-checkpoint-alpha'));
  assert('snapshot file created', !!testSnapshot, testSnapshot || 'not found');

  if (testSnapshot) {
    const snapshotContent = fs.readFileSync(path.join(snapshotsDir, testSnapshot), 'utf-8');
    assert('snapshot contains checkpoint header', snapshotContent.includes('# Checkpoint: test-checkpoint-alpha'));
    assert('snapshot contains original PROJECT.md', snapshotContent.includes("What we're building"));
  }

  // Verify PROJECT.md was updated with checkpoint entry
  const updatedMd = readProjectMd();
  assert('PROJECT.md has Checkpoints section', updatedMd.includes('## Checkpoints'));
  assert('PROJECT.md has checkpoint entry', updatedMd.includes('"test-checkpoint-alpha"'));
}

// ── Test: Sync Command (programmatic) ─────────────────────────────
async function testSync() {
  section('Sync Command');

  // Write a base PROJECT.md first
  const baseMd = `# relay

> Relay context

## What we're building

A CLI tool for persistent AI context. This should NOT be overwritten by sync.

## Tech stack

- TypeScript

## What's in progress

Manual notes here.

## What's next

- Ship V1

## Conventions

- Keep it simple

## File structure

_(will be populated by sync)_

## What's working

- Everything

## What we're NOT building

- Cloud sync
`;

  writeProjectMd(baseMd);

  // Run sync from the monorepo root
  const origCwd = process.cwd();
  process.chdir(path.resolve(__dirname, '../../../'));

  const { syncCommand } = await import('./commands/sync');
  await syncCommand();

  process.chdir(origCwd);

  // Verify
  const synced = readProjectMd();
  assert('Synced PROJECT.md is non-empty', synced.length > 0);
  assert('Preserved "What we\'re building" content',
    synced.includes('This should NOT be overwritten by sync'));
  assert('Preserved "Conventions"', synced.includes('Keep it simple'));
  assert('Preserved "What\'s next"', synced.includes('Ship V1'));
  assert('Preserved "What we\'re NOT building"', synced.includes('Cloud sync'));
  assert('File structure was updated', !synced.includes('will be populated by sync'));
  assert('Tech stack was updated', synced.includes('TypeScript'));
  assert('Recently modified section present', synced.includes('Recently modified'));
  assert('Last synced timestamp added', synced.includes('Last synced'));

  console.log(`\n    Synced PROJECT.md (first 30 lines):`);
  console.log('    ─'.repeat(30));
  synced.split('\n').slice(0, 30).forEach((l) => console.log(`    ${l}`));
}

// ── Test: Inject Command (raw mode, programmatic) ─────────────────
async function testInject() {
  section('Inject Command (--raw mode)');

  // Capture console.log output
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(' '));
  };

  const { injectCommand } = await import('./commands/inject');
  await injectCommand({ raw: true });

  console.log = origLog;

  const output = logs.join('\n');
  assert('Output contains RELAY CONTEXT header', output.includes('--- RELAY CONTEXT:'));
  assert('Output contains END RELAY CONTEXT', output.includes('--- END RELAY CONTEXT ---'));
  assert('Output contains project content', output.includes("What we're building"));

  console.log(`\n    Inject output (first 10 lines):`);
  console.log('    ─'.repeat(30));
  output.split('\n').slice(0, 10).forEach((l) => console.log(`    ${l}`));
}

// ── Run All Tests ─────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     RELAY CLI — End-to-End Tests     ║');
  console.log('╚══════════════════════════════════════╝');

  try {
    testStorage();
    await testScanner();
    testCompressor();
    await testCheckpoint();
    await testSync();
    await testInject();
  } catch (err) {
    console.log(`\n💥 Unexpected error: ${err}`);
    if (err instanceof Error) {
      console.log(err.stack);
    }
    failed++;
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 13 - String(passed).length - String(failed).length))}║`);
  console.log('╚══════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
