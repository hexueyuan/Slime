<template>
  <div
    data-testid="app-sidebar"
    class="flex w-12 shrink-0 flex-col items-center border-r border-border bg-sidebar pt-12"
  >
    <button
      data-testid="sidebar-evolution"
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground"
      title="进化中心"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        <path d="m5.6 5.6 2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8" />
      </svg>
    </button>
  </div>
</template>
