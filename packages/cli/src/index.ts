#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { syncCommand } from './commands/sync';
import { injectCommand } from './commands/inject';
import { checkpointCommand } from './commands/checkpoint';
import { listCommand } from './commands/list';

const program = new Command();

program
  .name('relay')
  .description('Persistent AI context across sessions and tools')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Relay for the current project')
  .action(initCommand);

program
  .command('sync')
  .description('Scan project and update context')
  .action(syncCommand);

program
  .command('inject')
  .description('Output compressed context ready to paste into any AI')
  .option('--raw', 'Skip compression, output full PROJECT.md')
  .option('--ai', 'Force AI compression mode using Anthropic Haiku')
  .option('--bug', 'Debug mode: include git diff + prompt for error message')
  .action(injectCommand);

program
  .command('checkpoint')
  .description('Save a named snapshot of current context, or list checkpoints')
  .argument('[message]', 'Checkpoint message')
  .option('-l, --list', 'List all saved checkpoints')
  .action(async (message, options) => {
    await checkpointCommand(message, options);
  });

program
  .command('list')
  .description('Show all projects tracked by Relay')
  .action(async () => {
    await listCommand();
  });

program.parse();
