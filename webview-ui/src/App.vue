<template>
  <div>
    <!-- 
      We'll pass the `stages` array to our GraphView component.
      You can replace GraphView with your own implementation or a library-based component.
    -->
    <GraphView :stages="stages" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import GraphView from "./GraphView.vue";

/**
 * Reactive reference to hold the stages array 
 * that comes from window.postMessage({ command: "update", data }).
 */
const stages = ref<any[]>([]);

/**
 * Handler for the window "message" event.
 */
function handleMessage(event: MessageEvent) {
  // console.log(event)
  const { command, data } = event.data || {};
  if (command === "update") {
    // Update our local ref with the new data
    stages.value = data;
  }
}

onMounted(() => {
  // Register the event listener
  window.addEventListener("message", handleMessage);
});

onBeforeUnmount(() => {
  // Clean up: remove the event listener
  window.removeEventListener("message", handleMessage);
});
</script>

<style scoped>
/* Add any styles needed here */
</style>
