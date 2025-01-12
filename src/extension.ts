import { commands, ExtensionContext, window, workspace, TextDocument } from "vscode";
import { HelloWorldPanel } from "./panels/HelloWorldPanel";

let currentGraphData: any[] = [];

/** Check if the data is valid ISEKAI graph data */
function isValidGraphData(data: any): boolean {
  return Array.isArray(data) && data.every((item: any) => (
    typeof item.uuid === 'string' &&
    typeof item.text === 'string' &&
    Array.isArray(item.requires) &&
    Array.isArray(item.ensures) &&
    typeof item.stage === 'string'
  ));
}

/** Attempt to parse and render the graph panel */
function tryRenderGraphPanel(document: TextDocument, context: ExtensionContext) {
  try {
    const data = JSON.parse(document.getText());
    if (isValidGraphData(data)) {
      currentGraphData = data;
      HelloWorldPanel.render(context.extensionUri, currentGraphData);
    }
  } catch (e) {
    console.error("Failed to parse ISEKAI graph data:", e);
  }
}

export function activate(context: ExtensionContext) {
  // 1) Command to manually show the Hello World panel
  const showHelloWorldCommand = commands.registerCommand("hello-world.showHelloWorld", () => {
    HelloWorldPanel.render(context.extensionUri, currentGraphData);
  });
  context.subscriptions.push(showHelloWorldCommand);

  // 2) Check the currently active document (e.g. if user reopened IDE with a file open)
  if (window.activeTextEditor?.document) {
    tryRenderGraphPanel(window.activeTextEditor.document, context);
  }

  // 3) Watch if the user changes to another text editor
  const activeEditorWatcher = window.onDidChangeActiveTextEditor((editor) => {
    if (editor?.document) {
      tryRenderGraphPanel(editor.document, context);
    }
  });
  context.subscriptions.push(activeEditorWatcher);

  // 4) Watch for changes in the current document
  const documentChangeWatcher = workspace.onDidChangeTextDocument((event) => {
    if (event.document === window.activeTextEditor?.document) {
      tryRenderGraphPanel(event.document, context);
    }
  });
  context.subscriptions.push(documentChangeWatcher);
}

export function deactivate() {}
