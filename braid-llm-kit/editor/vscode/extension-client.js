// extension-client.js — VSCode extension entry point for Braid language support
// Activates the LSP client that connects to braid-lsp.js
"use strict";

const path = require('path');
const { workspace, ExtensionContext } = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

function activate(context) {
  // Path to the LSP server module
  const serverModule = context.asAbsolutePath(path.join('server', 'braid-lsp.js'));

  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'braid' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.braid'),
    },
  };

  client = new LanguageClient(
    'braidLanguageServer',
    'Braid Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

function deactivate() {
  if (client) return client.stop();
  return undefined;
}

module.exports = { activate, deactivate };
