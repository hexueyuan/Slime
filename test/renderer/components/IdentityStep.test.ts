import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

;(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
}

import IdentityStep from '@/components/onboarding/IdentityStep.vue'

describe('IdentityStep', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows version preview when username is entered', () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: 'alice' },
    })
    expect(wrapper.text()).toContain('egg-v0.1-alice')
  })

  it('disables next button when username is empty', () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: '' },
    })
    const btn = wrapper.find('[data-testid="next-btn"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows validation error for special characters', async () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: '' },
    })
    const input = wrapper.find('[data-testid="onboard-username"]')
    await input.setValue('bad user!')
    expect(wrapper.text()).toContain('只允许')
  })

  it('accepts valid usernames with letters, numbers, hyphens, underscores', async () => {
    const wrapper = mount(IdentityStep, {
      props: { userName: '' },
    })
    const input = wrapper.find('[data-testid="onboard-username"]')
    await input.setValue('alice_2024-test')
    expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(false)
  })
})
