<script setup lang="ts">
import SlimeWeekCalendar from "@/components/slime/SlimeWeekCalendar.vue";

defineProps<{ selectedDate: string }>();
defineEmits<{ "update:selectedDate": [date: string] }>();
</script>

<template>
  <SlimeWeekCalendar
    :selected-date="selectedDate"
    @update:selected-date="$emit('update:selectedDate', $event)"
  />
</template>
