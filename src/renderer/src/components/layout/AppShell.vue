<template>
  <div
    class="grid h-screen w-screen grid-cols-[330px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[var(--color-border-strong)] bg-[var(--color-app)] text-[var(--color-text-primary)]"
  >
    <slot name="sidebar" />
    <main
      class="min-w-0 overflow-hidden rounded-tl-[15px] border-l border-t border-[var(--color-border-subtle)] bg-[var(--color-app-canvas)]"
    >
      <slot />
    </main>
  </div>
</template>
