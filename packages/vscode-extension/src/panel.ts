import * as vscode from 'vscode';

/**
 * Webview panel provider for the Relay sidebar.
 *
 * Shows:
 * - Project name
 * - What's in progress
 * - Last checkpoint
 * - Action buttons: Sync, Inject, Checkpoint
 */
export class RelayPanelProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'sync':
          await vscode.commands.executeCommand('relay.sync');
          this.refresh(webviewView);
          break;
        case 'inject':
          await vscode.commands.executeCommand('relay.inject');
          break;
        case 'checkpoint':
          await vscode.commands.executeCommand('relay.checkpoint');
          this.refresh(webviewView);
          break;
        case 'refresh':
          this.refresh(webviewView);
          break;
      }
    });
  }

  private refresh(webviewView: vscode.WebviewView): void {
    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  private getProjectInfo(): {
    name: string;
    inProgress: string;
    lastCheckpoint: string;
    initialized: boolean;
  } {
    try {
      // Dynamic import to avoid load-time dependency issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const storage = require('@relay/cli/dist/core/storage');
      const fs = require('fs');

      const projectPath = storage.getProjectPath();
      if (!fs.existsSync(projectPath)) {
        return {
          name: storage.getProjectName(),
          inProgress: '',
          lastCheckpoint: '',
          initialized: false,
        };
      }

      const md: string = storage.readProjectMd();
      const name: string = storage.getProjectName();

      // Extract "What's in progress" section
      let inProgress = '';
      const progressMatch = md.match(
        /## What's in progress\n([\s\S]*?)(?=\n##|$)/
      );
      if (progressMatch) {
        inProgress = progressMatch[1].trim().slice(0, 200);
      }

      // Extract last checkpoint
      let lastCheckpoint = '';
      const checkpointMatch = md.match(
        /## Checkpoints\n([\s\S]*?)(?=\n##|$)/
      );
      if (checkpointMatch) {
        const lines = checkpointMatch[1].trim().split('\n').filter(Boolean);
        if (lines.length > 0) {
          lastCheckpoint = lines[lines.length - 1].replace(/^- /, '');
        }
      }

      return { name, inProgress, lastCheckpoint, initialized: true };
    } catch {
      return {
        name: 'Unknown',
        inProgress: '',
        lastCheckpoint: '',
        initialized: false,
      };
    }
  }

  private getHtml(_webview: vscode.Webview): string {
    const info = this.getProjectInfo();

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (!info.initialized) {
      return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
    .msg { text-align: center; margin-top: 24px; opacity: 0.8; }
    button {
      display: block; width: 100%; padding: 8px; margin-top: 16px; cursor: pointer;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <p class="msg">Relay is not initialized for this project.</p>
  <button onclick="init()">Initialize Relay</button>
  <script>
    const vscode = acquireVsCodeApi();
    function init() { vscode.postMessage({ command: 'init' }); }
  </script>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
    h2 { font-size: 14px; margin: 0 0 12px 0; display: flex; align-items: center; gap: 6px; }
    .section { margin-bottom: 16px; }
    .label { font-size: 11px; text-transform: uppercase; opacity: 0.6; margin-bottom: 4px; letter-spacing: 0.5px; }
    .content { font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
    .empty { opacity: 0.4; font-style: italic; }
    .buttons { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }
    button {
      padding: 6px 12px; cursor: pointer; border: none; border-radius: 4px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      font-size: 12px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    hr { border: none; border-top: 1px solid var(--vscode-widget-border); margin: 12px 0; }
  </style>
</head>
<body>
  <h2>🔗 ${escapeHtml(info.name)}</h2>

  <div class="section">
    <div class="label">In Progress</div>
    <div class="content">${
      info.inProgress
        ? escapeHtml(info.inProgress)
        : '<span class="empty">No active work tracked</span>'
    }</div>
  </div>

  <div class="section">
    <div class="label">Last Checkpoint</div>
    <div class="content">${
      info.lastCheckpoint
        ? escapeHtml(info.lastCheckpoint)
        : '<span class="empty">No checkpoints yet</span>'
    }</div>
  </div>

  <hr>

  <div class="buttons">
    <button onclick="send('sync')">🔄 Sync Context</button>
    <button onclick="send('inject')">📋 Copy Context</button>
    <button class="secondary" onclick="send('checkpoint')">💾 Save Checkpoint</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
  }
}
