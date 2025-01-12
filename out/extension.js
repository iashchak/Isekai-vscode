"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode_1 = require("vscode");
const HelloWorldPanel_1 = require("./panels/HelloWorldPanel");
let currentGraphData = [];
/** Check if the data is valid ISEKAI graph data */
function isValidGraphData(data) {
    return Array.isArray(data) && data.every((item) => (typeof item.uuid === 'string' &&
        typeof item.text === 'string' &&
        Array.isArray(item.requires) &&
        Array.isArray(item.ensures) &&
        typeof item.stage === 'string'));
}
/** Attempt to parse and render the graph panel */
function tryRenderGraphPanel(document, context) {
    try {
        const data = JSON.parse(document.getText());
        if (isValidGraphData(data)) {
            currentGraphData = data;
            HelloWorldPanel_1.HelloWorldPanel.render(context.extensionUri, currentGraphData);
        }
    }
    catch (e) {
        console.error("Failed to parse ISEKAI graph data:", e);
    }
}
function activate(context) {
    var _a;
    // 1) Command to manually show the Hello World panel
    const showHelloWorldCommand = vscode_1.commands.registerCommand("hello-world.showHelloWorld", () => {
        HelloWorldPanel_1.HelloWorldPanel.render(context.extensionUri, currentGraphData);
    });
    context.subscriptions.push(showHelloWorldCommand);
    // 2) Check the currently active document (e.g. if user reopened IDE with a file open)
    if ((_a = vscode_1.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document) {
        tryRenderGraphPanel(vscode_1.window.activeTextEditor.document, context);
    }
    // 3) Watch if the user changes to another text editor
    const activeEditorWatcher = vscode_1.window.onDidChangeActiveTextEditor((editor) => {
        if (editor === null || editor === void 0 ? void 0 : editor.document) {
            tryRenderGraphPanel(editor.document, context);
        }
    });
    context.subscriptions.push(activeEditorWatcher);
    // 4) Watch for changes in the current document
    const documentChangeWatcher = vscode_1.workspace.onDidChangeTextDocument((event) => {
        var _a;
        if (event.document === ((_a = vscode_1.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document)) {
            tryRenderGraphPanel(event.document, context);
        }
    });
    context.subscriptions.push(documentChangeWatcher);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map