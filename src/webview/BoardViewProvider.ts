import * as vscode from 'vscode';
import { BoardService } from '../services/BoardService.js';
import { WindowManager } from '../services/WindowManager.js';
import { WebviewMessage, ExtensionMessage } from '../types/messages.js';

/**
 * Provides the webview for the kanban board
 */
export class BoardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanvis4.boardView';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly boardService: BoardService,
    private readonly windowManager: WindowManager
  ) {
    // Listen for board state changes
    boardService.onStateChange((state) => {
      this.sendMessage({
        type: 'state',
        state,
        currentWindowId: windowManager.getCurrentWindowId(),
      });
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
      ],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      await this.handleMessage(message);
    });

    // Send initial state when visible
    if (webviewView.visible) {
      this.sendInitialState();
    }

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendInitialState();
      }
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          this.sendInitialState();
          break;

        case 'refresh':
          await this.windowManager.registerCurrentWindow();
          this.sendInitialState();
          break;

        case 'window:open':
          await this.openWindow(message.windowId);
          break;

        case 'window:move':
          await this.boardService.moveWindow(
            message.windowId,
            message.toColumnId,
            message.toOrder
          );
          break;

        case 'window:update':
          await this.boardService.updateWindow(message.windowId, message.updates);
          break;

        case 'window:delete': {
          const confirm = await vscode.window.showWarningMessage(
            'Delete this window from the board?',
            { modal: true },
            'Delete'
          );
          if (confirm === 'Delete') {
            await this.boardService.removeWindow(message.windowId);
          }
          break;
        }
      }
    } catch (error) {
      this.sendMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async openWindow(windowId: string): Promise<void> {
    const state = this.boardService.getState();
    const window = state.windows.find(w => w.id === windowId);

    if (!window) {
      vscode.window.showErrorMessage('Window not found');
      return;
    }

    try {
      const uri = vscode.Uri.file(window.path);
      await vscode.commands.executeCommand('vscode.openFolder', uri, {
        forceNewWindow: true,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open window: ${error}`);
    }
  }

  private sendInitialState(): void {
    this.sendMessage({
      type: 'state',
      state: this.boardService.getState(),
      currentWindowId: this.windowManager.getCurrentWindowId(),
    });
  }

  private sendMessage(message: ExtensionMessage): void {
    this.view?.webview.postMessage(message);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css')
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>KanVis Board</title>
</head>
<body>
    <div id="app">
        <div class="toolbar">
            <button id="refresh-btn" class="btn" title="Refresh">⟳</button>
            <div class="spacer"></div>
        </div>
        <div id="board" class="board"></div>
        <div id="loading" class="loading">Loading...</div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
