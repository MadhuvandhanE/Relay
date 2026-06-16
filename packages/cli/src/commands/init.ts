import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import {
  getRelayRoot,
  getProjectName,
  getProjectPath,
  writeProjectMd,
  readConfig,
  writeConfig,
} from '../core/storage';

/**
 * Generate the initial PROJECT.md content from user answers.
 */
function generateProjectMd(
  projectName: string,
  description: string,
  techStack: string,
  currentWork: string,
  timestamp: string
): string {
  return `# ${projectName}

> Relay context — auto-generated on ${timestamp}

## What we're building

${description}

## Tech stack

${techStack
  .split(',')
  .map((t) => `- ${t.trim()}`)
  .join('\n')}

## What's in progress

${currentWork}

## What's next

_(add your next priorities here)_

## Conventions

_(add project conventions, patterns, and rules here)_

## File structure

_(run \`relay sync\` to populate)_

## What's working

_(describe what's functional so far)_

## What we're NOT building

_(list out-of-scope items here)_
`;
}

/**
 * relay init — Initialize Relay for the current project.
 *
 * Flow:
 * 1. Ensure relay root directory exists
 * 2. Detect project name
 * 3. Check for existing project, prompt for re-init
 * 4. Interactive setup prompts
 * 5. Check/prompt for Anthropic API key
 * 6. Write initial PROJECT.md
 */
export async function initCommand(): Promise<void> {
  // 1. Ensure relay root exists
  const relayRoot = getRelayRoot();
  fs.mkdirSync(relayRoot, { recursive: true });

  // 2. Detect project name
  const projectName = getProjectName();
  const projectPath = getProjectPath();

  console.log(`\n🔗 Relay — initializing for "${projectName}"\n`);

  // 3. Check if already initialized
  if (fs.existsSync(projectPath)) {
    const { reinit } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinit',
        message: 'Project already initialized. Re-initialize?',
        default: false,
      },
    ]);
    if (!reinit) {
      console.log('Aborted.');
      return;
    }
  }

  // 4. Interactive setup
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'What are you building? (one line)',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a description',
    },
    {
      type: 'input',
      name: 'techStack',
      message: 'What\'s your main tech stack? (comma separated)',
      default: 'TypeScript, Node.js',
    },
    {
      type: 'input',
      name: 'currentWork',
      message: 'What are you currently working on?',
      default: 'Initial setup',
    },
  ]);

  // 5. Check for API key
  const config = readConfig();
  if (!config.anthropicApiKey) {
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Anthropic API key (press Enter to skip):',
        mask: '*',
      },
    ]);
    if (apiKey && apiKey.trim()) {
      config.anthropicApiKey = apiKey.trim();
      writeConfig(config);
      console.log('  ✓ API key saved to config');
    } else {
      console.log('  ⚠  No API key configured. Using local fallback compression.');
    }
  }

  // 6. Write PROJECT.md
  const timestamp = new Date().toISOString().split('T')[0];
  const content = generateProjectMd(
    projectName,
    answers.description,
    answers.techStack,
    answers.currentWork,
    timestamp
  );

  writeProjectMd(content);

  // Create snapshots directory
  const snapshotsDir = path.join(projectPath, 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });

  // Write meta.json
  const metaPath = path.join(projectPath, 'meta.json');
  const meta = {
    name: projectName,
    cwd: process.cwd(),
    lastSync: null,
    lastCheckpoint: null,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  console.log(`\n✅ Relay initialized for "${projectName}"`);
  console.log(`   📁 ${projectPath}`);
  console.log(`\n   Run \`relay sync\` to capture current project state.\n`);
}
