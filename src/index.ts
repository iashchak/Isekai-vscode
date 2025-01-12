import * as vscode from 'vscode';
import { defineExtension } from 'reactive-vscode';

/**
 * Проверяет, что JSON-документ представляет из себя массив объектов
 * вида { uuid: string, requires: string[], ensures: string[] }.
 */
function isValidGraphData(data: any): boolean {
    return Array.isArray(data) && data.every(
        (item: any) =>
            typeof item.uuid === 'string' &&
            Array.isArray(item.requires) &&
            Array.isArray(item.ensures)
    );
}

/**
 * Преобразует массив объектов в массивы узлов (nodes) и связей (links) для D3.
 * - Каждый объект из data — это вершина (node).
 * - Связи (links) формируются из полей `requires` и `ensures`.
 */
function transformGraphData(data: any) {
    // Все объекты считаем вершинами
    const nodes = data.map((item: any) => ({
        uuid: item.uuid,
        requires: item.requires,
        ensures: item.ensures
    }));

    // Формируем рёбра:
    // Для каждого item:
    //   1. Все item.requires => ребро source = требует, target = item.uuid
    //   2. Все item.ensures => ребро source = item.uuid, target = элемент ensures
    const links: Array<{ source: string; target: string }> = [];

    data.forEach((item: any) => {
        // Допустим, если "requires" — это зависимости, 
        // которые должны идти "из requires к item"
        item.requires.forEach((req: string) => {
            links.push({ source: req, target: item.uuid });
        });
        // Если "ensures" — это то, что "item" гарантирует, 
        // то ребро идёт "из item к ensures"
        item.ensures.forEach((ens: string) => {
            links.push({ source: item.uuid, target: ens });
        });
    });

    return { nodes, links };
}

/**
 * Генерирует HTML с использованием D3.js.
 */
function getGraphHtml(graphData: any): string {
    // Преобразуем изначальный массив объектов в { nodes, links }
    const { nodes, links } = transformGraphData(graphData);

    // Вставляем их в HTML в виде JSON-строк
    const nodesJson = JSON.stringify(nodes);
    const linksJson = JSON.stringify(links);

    return /* html */`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Graph View</title>
        <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
        <style>
            html, body {
                width: 100%;
                height: 100%;
                margin: 0;
                padding: 0;
            }
            svg {
                width: 100%;
                height: 100%;
                background: #ffffff;
            }
        </style>
    </head>
    <body>
        <svg id="graph"></svg>
        <script>
            const nodes = ${nodesJson};
            const links = ${linksJson};

            const width = window.innerWidth;
            const height = window.innerHeight;

            const svg = d3.select('#graph')
                .attr('width', width)
                .attr('height', height);

            // Создаём simulation
            const simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links).id(d => d.uuid).distance(80))
                .force('charge', d3.forceManyBody().strength(-200))
                .force('center', d3.forceCenter(width / 2, height / 2));

            // Добавляем линии для ссылок
            const link = svg.append('g')
                .attr('stroke', '#999')
                .attr('stroke-opacity', 0.6)
              .selectAll('line')
              .data(links)
              .enter().append('line')
                .attr('stroke-width', 1.5);

            // Добавляем узлы в виде окружностей
            const node = svg.append('g')
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5)
              .selectAll('circle')
              .data(nodes)
              .enter().append('circle')
                .attr('r', 6)
                .attr('fill', 'blue')
                .call(d3.drag()
                    .on('start', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on('drag', (event, d) => {
                        d.fx = event.x;
                        d.fy = event.y;
                    })
                    .on('end', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fx = null;
                        d.fy = null;
                    })
                );

            // Подписи (пример: показываем uuid)
            const labels = svg.append('g')
              .selectAll('text')
              .data(nodes)
              .enter().append('text')
                .text(d => d.uuid)
                .attr('font-size', 10)
                .attr('fill', 'black');

            // Каждое "тиковое" обновление
            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);

                labels
                    .attr('x', d => d.x + 8)
                    .attr('y', d => d.y + 4);
            });
        </script>
    </body>
    </html>`;
}

const { activate, deactivate } = defineExtension(() => {
    vscode.window.showInformationMessage('Hello from the Graph Extension!');

    let currentPanel: vscode.WebviewPanel | null = null;

    // При открытии любого JSON-файла мы пытаемся проверить, не является ли он нашим форматом
    vscode.workspace.onDidOpenTextDocument(async (document) => {
        if (document.languageId === 'json' && document.fileName.endsWith('.json')) {
            try {
                const jsonData = JSON.parse(document.getText());

                if (isValidGraphData(jsonData)) {
                    vscode.window.showInformationMessage('Открыт JSON-файл с графом');
                    // Если панель ещё не создана — создаём
                    if (!currentPanel) {
                        currentPanel = vscode.window.createWebviewPanel(
                            'graphView',
                            'Graph View',
                            {
                                viewColumn: vscode.ViewColumn.Beside,
                                preserveFocus: true,
                            },
                            {
                                enableScripts: true,
                            }
                        );

                        currentPanel.onDidDispose(() => {
                            currentPanel = null;
                        });
                    }

                    // Обновляем HTML в вебвью
                    currentPanel.webview.html = getGraphHtml(jsonData);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage('Ошибка при парсинге JSON: ' + error.message);
            }
        }
    });

    // При любом изменении JSON-файла проверяем формат и, если всё корректно, обновляем граф
    vscode.workspace.onDidChangeTextDocument(async (event) => {
        const document = event.document;
        if (document.languageId === 'json' && document.fileName.endsWith('.json')) {
            try {
                const jsonData = JSON.parse(document.getText());
                if (isValidGraphData(jsonData) && currentPanel) {
                    currentPanel.webview.html = getGraphHtml(jsonData);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage('Ошибка при обновлении JSON: ' + error.message);
            }
        }
    });
});

export { activate, deactivate };
