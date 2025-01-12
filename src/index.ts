import * as vscode from 'vscode';
import { defineExtension } from 'reactive-vscode';

/**
 * Проверяет, что JSON-документ представляет из себя массив объектов вида:
 * {
 *   uuid: string,
 *   text: string,
 *   requires: string[],
 *   ensures: string[],
 *   stage: string
 * }
 */
function isValidGraphData(data: any): boolean {
    return Array.isArray(data) && data.every(
        (item: any) =>
            typeof item.uuid === 'string' &&
            typeof item.text === 'string' &&
            Array.isArray(item.requires) &&
            Array.isArray(item.ensures) &&
            typeof item.stage === 'string'
    );
}

/**
 * Преобразует массив объектов в массивы узлов (nodes) и связей (links) для D3.
 * Теперь в каждом link мы также сохраним поле reqKey — 
 * это тот ключ, по которому был создан link (т.е. совпадение в requires/ensures).
 */
function transformGraphData(data: any) {
    // Подготовка узлов (с учётом поля text)
    const nodes = data.map((item: any) => ({
        uuid: item.uuid,
        text: item.text,
        stage: item.stage,
        requires: item.requires,
        ensures: item.ensures
    }));

    // Формируем рёбра (links) — для каждого req в item1, который найден в item2.ensures
    const links: Array<{ source: string; target: string; reqKey: string }> = [];
    for (const item1 of nodes) {
        for (const item2 of nodes) {
            if (item1.uuid !== item2.uuid) {
                for (const req of item1.requires) {
                    if (item2.ensures.includes(req)) {
                        links.push({
                            source: item1.uuid,
                            target: item2.uuid,
                            reqKey: req // сохраняем, что именно сконнектило эти два узла
                        });
                    }
                }
            }
        }
    }

    return { nodes, links };
}

/**
 * Утилита, чтобы взять первые N слов из строки
 */
function getFirstWords(text: string, n: number = 4) {
    return text.split(/\s+/).slice(0, n).join(' ');
}

/**
 * Генерирует HTML с использованием D3.js.
 * 1) Узлы:
 *    - label = первые 4 слова из поля text
 *    - цвет узлов = d3.schemeSet3 по полю stage
 * 2) Рёбра:
 *    - отдельная шкала цветов по reqKey (d3.schemeCategory10)
 *    - надпись посередине ребра (text = reqKey)
 */
function getGraphHtml(graphData: any): string {
    const { nodes, links } = transformGraphData(graphData);
    const nodesJson = JSON.stringify(nodes);
    const linksJson = JSON.stringify(links);

    return /* html */ `
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
                position: relative;
            }
            svg {
                width: 100%;
                height: 100%;
                background: #ffffff;
            }
            #recenterButton {
                position: absolute;
                top: 10px;
                left: 10px;
                z-index: 999;
                padding: 5px 10px;
                cursor: pointer;
                background: #ddd;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            .link-label {
                font-size: 9px;
                pointer-events: none; /* чтобы не мешало драгу узлов */
            }
        </style>
    </head>
    <body>
        <button id="recenterButton">Recenter</button>
        <svg id="graph"></svg>
        <script>
            const nodes = ${nodesJson};
            const links = ${linksJson};

            const width = window.innerWidth;
            const height = window.innerHeight;

            const svg = d3.select('#graph')
                .attr('width', width)
                .attr('height', height);

            // Основная группа-контейнер для зума/пэна
            const container = svg.append('g');

            // Настраиваем зум и панорамирование
            const zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .on('zoom', (event) => {
                    container.attr('transform', event.transform);
                });
            svg.call(zoom);

            // Начальный трансформ (центрируем)
            svg.call(
                zoom.transform,
                d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
            );

            // Шкала цветов для stage (узлы)
            const allStages = [...new Set(nodes.map(d => d.stage))];
            const colorScaleNodes = d3.scaleOrdinal(d3.schemeSet3)
                .domain(allStages);

            // Шкала цветов для reqKey (рёбра)
            // Соберём все уникальные reqKey:
            const allReqKeys = [...new Set(links.map(d => d.reqKey))];
            const colorScaleLinks = d3.scaleOrdinal(d3.schemeCategory10)
                .domain(allReqKeys);

            // Силовая схема
            const simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links)
                                 .id(d => d.uuid)
                                 .distance(80))
                .force('charge', d3.forceManyBody().strength(-200))
                .force('center', d3.forceCenter(0, 0));

            // Рёбра (линии)
            const link = container.append('g')
                .selectAll('line')
                .data(links)
                .enter().append('line')
                .attr('stroke-width', 1.5)
                .attr('stroke-opacity', 0.6)
                .attr('stroke', d => colorScaleLinks(d.reqKey));

            // Добавляем "лейблы" для ребер (наименование reqKey)
            const linkLabels = container.append('g')
                .selectAll('.link-label')
                .data(links)
                .enter()
                .append('text')
                .attr('class', 'link-label')
                .text(d => d.reqKey)
                .attr('fill', d => colorScaleLinks(d.reqKey));

            // Узлы
            const node = container.append('g')
                .selectAll('circle')
                .data(nodes)
                .enter().append('circle')
                .attr('r', 6)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5)
                .attr('fill', d => colorScaleNodes(d.stage))
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

            // Подписи для узлов (первые 4 слова из text)
            const nodeLabels = container.append('g')
                .selectAll('text.node-label')
                .data(nodes)
                .enter().append('text')
                .attr('class', 'node-label')
                .text(d => {
                    // Возьмём первые 4 слова из text
                    return d.text.split(/\\s+/).slice(0, 4).join(' ');
                })
                .attr('font-size', 10)
                .attr('fill', 'black');

            // Каждое "тиковое" обновление симуляции
            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                linkLabels
                    // Разместим лейбл на середине между source и target
                    .attr('x', d => (d.source.x + d.target.x) / 2)
                    .attr('y', d => (d.source.y + d.target.y) / 2);

                node
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);

                nodeLabels
                    // Смещаем подпись чуть в сторону от центра узла
                    .attr('x', d => d.x + 8)
                    .attr('y', d => d.y + 4);
            });

            // Кнопка Recenter
            const recenterButton = document.getElementById('recenterButton');
            recenterButton.addEventListener('click', () => {
                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
                );
                simulation.alpha(1).restart();
            });
        </script>
    </body>
    </html>
    `;
}

// Определяем и экспортируем логику активации/деактивации VSCode расширения
const { activate, deactivate } = defineExtension(() => {
    vscode.window.showInformationMessage('Hello from the Graph Extension!');

    let currentPanel: vscode.WebviewPanel | null = null;

    async function tryOpenPanelForDocument(document: vscode.TextDocument) {
        if (document.languageId === 'json' && document.fileName.endsWith('.json')) {
            try {
                const jsonData = JSON.parse(document.getText());
                if (isValidGraphData(jsonData)) {
                    if (!currentPanel) {
                        currentPanel = vscode.window.createWebviewPanel(
                            'graphView',
                            'Graph View',
                            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                            { enableScripts: true }
                        );
                        currentPanel.onDidDispose(() => {
                            currentPanel = null;
                        });
                    }
                    currentPanel.webview.html = getGraphHtml(jsonData);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage('Ошибка при парсинге JSON: ' + error.message);
            }
        }
    }

    // При активации расширения - проверяем уже открытые документы
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        tryOpenPanelForDocument(activeEditor.document);
    }
    for (const doc of vscode.workspace.textDocuments) {
        tryOpenPanelForDocument(doc);
    }

    // Подписываемся на события: открытие документа
    vscode.workspace.onDidOpenTextDocument(async (document) => {
        tryOpenPanelForDocument(document);
    });

    // Подписываемся на события: изменение документа
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
