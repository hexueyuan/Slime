<template>
  <div
    class="relative h-screen w-screen overflow-hidden rounded-[18px] border border-[var(--color-border-strong)] bg-[var(--color-app-sidebar)] text-[var(--color-text-primary)]"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_55%_8%,rgba(255,255,255,0.055),transparent_28%),radial-gradient(circle_at_14%_52%,rgba(255,255,255,0.028),transparent_34%)]"
    />
    <div class="relative grid h-full w-full grid-cols-[330px_minmax(0,1fr)] backdrop-blur-2xl">
      <slot name="sidebar" />
      <main
        class="min-w-0 overflow-hidden rounded-l-[15px] border-y border-l bg-[var(--color-app-canvas)] shadow-[inset_1px_0_0_rgba(255,255,255,0.13)]"
        style="
          border-color: color-mix(
            in srgb,
            var(--color-border-strong) 72%,
            rgba(255, 255, 255, 0.18)
          );
        "
      >
        <slot />
      </main>
    </div>
  </div>
</template>
