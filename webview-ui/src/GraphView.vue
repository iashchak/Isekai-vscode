<template>
  <div class="graph-container">
    <!-- Контейнер для графа D3 -->
    <div ref="chartContainer" class="graph-area"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import * as d3 from "d3";

interface Stage {
  uuid: string;
  stage: string;
  text: string;
  ensures: string[]; // выходные "ресурсы"
  requires: string[]; // входные "ресурсы"
}

// Перечисление стадий, чтобы присвоить каждой порядковый номер:
const stageOrder = [
  "ordinary_world",
  "call_to_adventure",
  "refusal_of_call",
  "meeting_the_mentor",
  "crossing_first_threshold",
  "tests_allies_enemies",
  "approach_inmost_cave",
  "ordeal",
  "reward",
  "road_back",
  "resurrection",
  "return_with_elixir",
];

// Принимаем проп со списком стадий
const props = defineProps<{
  stages: Stage[];
}>();

// References
const chartContainer = ref<HTMLElement | null>(null);

// Храним ссылку на zoom-поведение, чтобы при желании можно было сбросить/перенастроить
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

// Храним ссылку на симуляцию d3
let simulation: d3.Simulation<d3.SimulationNodeDatum, undefined> | null = null;

/**
 * Функция сборки данных для графа (nodes + links).
 * Обратите внимание, что теперь мы на каждое совпадение intersection генерируем отдельную связь.
 */
function buildGraphData(stages: Stage[]) {
  // Создаём массив узлов.
  // К каждому узлу добавляем:
  // - orderIndex: порядковый номер (по индексу в stageOrder)
  // - shortLabel: первые 2–3 слова из стадии
  const nodes = stages.map((s) => {
    const orderIndex = stageOrder.indexOf(s.stage); // если не найдено, будет -1
    const shortLabel = s.text.split(" ").slice(0, 3).join(" ");
    return {
      id: s.uuid,
      shortLabel: shortLabel,
      orderIndex: orderIndex >= 0 ? orderIndex + 1 : -1, // +1, чтобы начиналось с 1
    };
  });

  // Генерируем массив связей.
  // Если у stageA и stageB есть несколько пересечений, делаем несколько рёбер.
  const links: Array<{
    source: string;
    target: string;
    text: string; // подпись на ребре
    dashed: boolean;
  }> = [];

  for (const stageA of stages) {
    for (const stageB of stages) {
      // Ищем пересечения A.ensures и B.requires
      const intersection = stageA.ensures.filter((item) =>
        stageB.requires.includes(item)
      );
      if (intersection.length > 0) {
        // Для каждого пересечения делаем отдельное ребро
        intersection.forEach((resource) => {
          // Проверяем, удовлетворены ли все requires B (для сплошной или пунктирной линии)
          const allRequirementsSatisfied = stageB.requires.every((req) =>
            stageA.ensures.includes(req)
          );
          links.push({
            source: stageA.uuid,
            target: stageB.uuid,
            text: resource, // подпись ребра — какой "ресурс" связывает
            dashed: !allRequirementsSatisfied,
          });
        });
      }
    }
  }

  return { nodes, links };
}

/**
 * Функция рендеринга/обновления D3-графа внутри контейнера.
 */
function renderGraph() {
  if (!chartContainer.value) return;

  // Собираем данные для графа
  const { nodes, links } = buildGraphData(props.stages);

  // Очищаем контейнер перед перерисовкой
  chartContainer.value.innerHTML = "";

  // Берём текущие размеры контейнера
  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight;

  // Создаём <svg>
  const svg = d3
    .select(chartContainer.value)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Основная группа, которая будет зумиться/перемещаться
  const svgGroup = svg.append("g");

  // -----------
  // Zoom
  // -----------
  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 8]) // можно менять, насколько разрешать приблизить/отдалить
    .on("zoom", (event) => {
      svgGroup.attr("transform", event.transform);
    });

  // Подключаем zoom к svg
  svg.call(zoomBehavior);

  // --------------
  // Force layout
  // --------------
  simulation = d3
    .forceSimulation(nodes as any)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d: any) => d.id)
        .distance(100)
    )
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // -------------
  // Цветовые шкалы
  // -------------
  // Для узлов
  const nodeColorScale = d3.scaleOrdinal(d3.schemeTableau10);
  // Для рёбер
  const linkColorScale = d3.scaleOrdinal(d3.schemeSet2);

  // -------------
  // Links
  // -------------
  const link = svgGroup
    .append("g")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke-width", 2)
    .style("stroke-dasharray", (d) => (d.dashed ? "5,5" : "0"))
    .style("stroke", (d) => linkColorScale(d.text));

  // Подписи на рёбрах
  const linkLabel = svgGroup
    .append("g")
    .selectAll("text")
    .data(links)
    .enter()
    .append("text")
    .attr("font-size", 10)
    .attr("fill", "#666")
    .text((d) => d.text);

  // -------------
  // Nodes
  // -------------
  const node = svgGroup
    .append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", 14)
    .attr("fill", (d) => nodeColorScale(d.shortLabel))
    .call(
      d3
        .drag<SVGCircleElement, any>()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
    );

  // Текст внутри кружочка (номер стадии)
  const nodeText = svgGroup
    .append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", 4) // чтобы чуть опустить текст
    .attr("font-size", 10)
    .attr("fill", "#fff")
    .text((d) => (d.orderIndex > 0 ? d.orderIndex : "?"));

  // Отдельная подпись стадии (рядом с кружочком) — короткое название
  const nodeLabel = svgGroup
    .append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text((d) => d.shortLabel)
    .attr("font-size", 12)
    .attr("fill", "#333");

  // ------------------------
  //  Simulation tick update
  // ------------------------
  simulation.on("tick", () => {
    link
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y);

    node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);

    // Позиция текста внутри кружочка
    nodeText
      .attr("x", (d: any) => d.x)
      .attr("y", (d: any) => d.y + 2);

    // Короткая подпись рядом с кружочком
    nodeLabel
      .attr("x", (d: any) => d.x + 18)
      .attr("y", (d: any) => d.y + 5);

    // Позиция подписей на рёбрах — примерно посередине
    linkLabel
      .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
      .attr("y", (d: any) => (d.source.y + d.target.y) / 2);
  });

  // -------------
  // Drag Helpers
  // -------------
  function dragStarted(event: d3.D3DragEvent<SVGCircleElement, any, any>, d: any) {
    if (!event.active && simulation) {
      simulation.alphaTarget(0.3).restart();
    }
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event: d3.D3DragEvent<SVGCircleElement, any, any>, d: any) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event: d3.D3DragEvent<SVGCircleElement, any, any>, d: any) {
    if (!event.active && simulation) {
      simulation.alphaTarget(0);
    }
    d.fx = null;
    d.fy = null;
  }
}

// Перерисовываем граф при изменении props.stages
watch(
  () => props.stages,
  () => {
    renderGraph();
  },
  { deep: true }
);

// Рендерим граф при первом монтировании
onMounted(() => {
  // Слушаем resize окна, чтобы граф автоматически растягивался
  window.addEventListener("resize", renderGraph, false);
  renderGraph();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", renderGraph, false);
});
</script>

<style scoped>
.graph-container {
  position: relative;
  width: 100vw; /* или другие размеры */
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.graph-area {
  width: 100%;
  height: 100%;
}
</style>
