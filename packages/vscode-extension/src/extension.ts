import * as vscode from 'vscode';
import { RelayPanelProvider } from './panel';
import { startWatcher } from './watcher';

/**
 * Activate the Relay VS Code extension.
 *
 * Registers:
 * - 4 commands: init, sync, inject, checkpoint
 * - Sidebar panel provider
 * - File watcher for auto-sync
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Relay extension activated');

  // Register commands
  const initCmd = vscode.commands.registerCommand('relay.init', async () => {
    const terminal = vscode.window.createTerminal('Relay');
    terminal.show();
    terminal.sendText('relay init');
  });

  const syncCmd = vscode.commands.registerCommand('relay.sync', async () => {
    try {
      const { syncCommand } = await import('@relay/cli/dist/commands/sync');
      await syncCommand();
      vscode.window.showInformationMessage('Relay: Context synced');
    } catch (err) {
      vscode.window.showErrorMessage(`Relay sync failed: ${err}`);
    }
  });

  const injectCmd = vscode.commands.registerCommand('relay.inject', async () => {
    try {
      const { readProjectMd, readConfig, getProjectName, getProjectPath } =
        await import('@relay/cli/dist/core/storage');
      const { compressContext, truncateContext } =
        await import('@relay/cli/dist/core/compressor');
      const fs = await import('fs');

      const projectPath = getProjectPath();
      if (!fs.existsSync(projectPath)) {
        vscode.window.showErrorMessage('Relay not initialized. Run "Relay: Initialize Project" first.');
        return;
      }

      const projectMd = readProjectMd();
      if (!projectMd) {
        vscode.window.showErrorMessage('PROJECT.md is empty. Run "Relay: Sync Context" first.');
        return;
      }

      const config = readConfig();
      let output: string;

      if (config.anthropicApiKey) {
        try {
          output = await compressContext(projectMd, config.anthropicApiKey);
        } catch {
          output = truncateContext(projectMd);
        }
      } else {
        output = truncateContext(projectMd);
      }

      const projectName = getProjectName();
      const fullOutput = `--- RELAY CONTEXT: ${projectName} ---\n${output}\n--- END RELAY CONTEXT ---`;

      await vscode.env.clipboard.writeText(fullOutput);
      vscode.window.showInformationMessage('Relay: Context copied to clipboard!');
    } catch (err) {
      vscode.window.showErrorMessage(`Relay inject failed: ${err}`);
    }
  });

  const checkpointCmd = vscode.commands.registerCommand('relay.checkpoint', async () => {
    const message = await vscode.window.showInputBox({
      prompt: 'Enter a checkpoint message',
      placeHolder: 'e.g. finished auth flow',
    });

    if (!message) return;

    try {
      const { checkpointCommand } = await import('@relay/cli/dist/commands/checkpoint');
      await checkpointCommand(message);
      vscode.window.showInformationMessage(`Relay: Checkpoint saved — "${message}"`);
    } catch (err) {
      vscode.window.showErrorMessage(`Relay checkpoint failed: ${err}`);
    }
  });

  // Register panel provider
  const panelProvider = new RelayPanelProvider(context.extensionUri);
  const panelRegistration = vscode.window.registerWebviewViewProvider(
    'relay.panel',
    panelProvider
  );

  // Start file watcher
  const watcherDisposable = startWatcher();

  context.subscriptions.push(
    initCmd,
    syncCmd,
    injectCmd,
    checkpointCmd,
    panelRegistration,
    watcherDisposable
  );
}

export function deactivate() {}
