import * as vscode from 'vscode';

/**
 * File watcher for auto-syncing Relay context.
 *
 * On any file save in the workspace:
 * - Runs relay sync silently in the background
 * - Debounced: only runs if last sync was >60 seconds ago
 * - No notifications unless there's an error
 */
export function startWatcher(): vscode.Disposable {
  let lastSyncTime = 0;
  const DEBOUNCE_MS = 60_000; // 60 seconds

  const watcher = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    // Skip if debounce window hasn't elapsed
    const now = Date.now();
    if (now - lastSyncTime < DEBOUNCE_MS) {
      return;
    }

    // Skip files outside the workspace
    if (!vscode.workspace.workspaceFolders) return;

    const inWorkspace = vscode.workspace.workspaceFolders.some((folder) =>
      doc.uri.fsPath.startsWith(folder.uri.fsPath)
    );
    if (!inWorkspace) return;

    // Skip certain file types that don't affect project structure
    const skipExtensions = ['.log', '.lock', '.map'];
    if (skipExtensions.some((ext) => doc.uri.fsPath.endsWith(ext))) return;

    lastSyncTime = now;

    try {
      const { syncCommand } = await import('@relay/cli/dist/commands/sync');
      await syncCommand();
    } catch (err) {
      // Silent failure — only log to output channel
      console.error('Relay auto-sync failed:', err);
    }
  });

  return watcher;
}
