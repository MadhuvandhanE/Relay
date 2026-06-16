import { readProjectMd, readConfig, getProjectName, getProjectPath } from '../core/storage';
import { compressContext, InjectIntent, preprocessContext } from '../core/compressor';
import fs from 'fs';
import inquirer from 'inquirer';
import readline from 'readline';

/**
 * Prompt the user to select an inject intent.
 * Defaults to 'continue' if not running in a TTY.
 */
async function selectIntent(): Promise<InjectIntent> {
  if (!process.stdin.isTTY) {
    return 'continue';
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'intent',
      message: "What's happening right now?",
      choices: [
        {
          name: '⚡ Hit a limit — continue exactly where I left off',
          value: 'continue',
        },
        {
          name: '🚀 Starting fresh — orient the AI to my project',
          value: 'newTask',
        },
        {
          name: '🐛 Hit a bug — include error context',
          value: 'debug',
        },
      ],
    },
  ]);
  return answers.intent;
}

/**
 * Ask user to input a multi-line error log.
 * Resolves when the user hits Enter twice on an empty line.
 */
function askMultilineError(): Promise<string> {
  return new Promise((resolve) => {
    console.log('\nPaste your error message (press Enter twice when done):');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const errorLines: string[] = [];
    let lastLineEmpty = false;

    rl.on('line', (line) => {
      if (line.trim() === '') {
        if (lastLineEmpty || errorLines.length === 0) {
          rl.close();
        } else {
          lastLineEmpty = true;
          errorLines.push(line);
        }
      } else {
        lastLineEmpty = false;
        errorLines.push(line);
      }
    });

    rl.on('close', () => {
      resolve(errorLines.join('\n').trim());
    });
  });
}

/**
 * relay inject — Output compressed context ready to paste into any AI.
 *
 * Options:
 * - --raw: outputs full PROJECT.md
 * - --ai: forces AI compression using Claude Haiku
 *
 * Flow:
 * 1. Read PROJECT.md
 * 2. Select intent and preprocess context
 * 3. Compress using Claude Haiku or local budget truncation
 * 4. Print with header/footer markers
 * 5. Copy to clipboard
 */
export async function injectCommand(options: { raw?: boolean; ai?: boolean; bug?: boolean }): Promise<void> {
  const projectName = getProjectName();
  const projectPath = getProjectPath();

  if (!fs.existsSync(projectPath)) {
    console.log('❌ Relay not initialized for this project. Run `relay init` first.');
    process.exit(1);
  }

  const projectMd = readProjectMd();
  if (!projectMd) {
    console.log('❌ PROJECT.md is empty. Run `relay sync` first.');
    process.exit(1);
  }

  let output: string;

  if (options.raw) {
    output = projectMd;
  } else {
    // 1. Get user intent (skip interactive menu if --bug is specified)
    const intent = options.bug ? 'debug' : await selectIntent();

    // 2. Ask for error logs if intent is 'debug'
    let errorMessage = '';
    if (intent === 'debug' && process.stdin.isTTY) {
      errorMessage = await askMultilineError();
    }

    // 3. Preprocess context to match intent specific requirements and cap budget
    const preprocessedMd = preprocessContext(projectMd, intent, errorMessage);

    const config = readConfig();
    const apiKey = config.anthropicApiKey;

    if (options.ai || apiKey) {
      if (!apiKey && options.ai) {
        console.log('❌ Error: Anthropic API key is not configured, but --ai is forced.');
        console.log('   Run `relay init` to set your Anthropic API key.\n');
        process.exit(1);
      }

      try {
        console.log('🔄 Compressing context with Claude Haiku...\n');
        output = await compressContext(preprocessedMd, apiKey || '', intent);
      } catch (err) {
        console.log('⚠️  Compression failed, using fallback truncation.\n');
        output = preprocessedMd;
      }
    } else {
      console.log('⚠️  No API key configured. Using local fallback truncation.');
      console.log('   Run `relay init` to set your Anthropic API key.\n');
      output = preprocessedMd;
    }
  }

  // Print with clear markers
  const header = `--- RELAY CONTEXT: ${projectName} ---`;
  const footer = `--- END RELAY CONTEXT ---`;

  console.log(header);
  console.log(output);
  console.log(footer);

  // Attempt to copy to clipboard
  try {
    await copyToClipboard(`${header}\n${output}\n${footer}`);
    console.log('\n📋 Copied to clipboard!');
  } catch {
    // Clipboard copy is optional — don't break if it fails
  }
}

/**
 * Attempt to copy text to system clipboard.
 * Uses platform-specific commands.
 */
async function copyToClipboard(text: string): Promise<void> {
  const { execSync } = await import('child_process');

  if (process.platform === 'win32') {
    execSync('clip', { input: text });
  } else if (process.platform === 'darwin') {
    execSync('pbcopy', { input: text });
  } else {
    // Linux: try xclip, then xsel
    try {
      execSync('xclip -selection clipboard', { input: text });
    } catch {
      execSync('xsel --clipboard --input', { input: text });
    }
  }
}
