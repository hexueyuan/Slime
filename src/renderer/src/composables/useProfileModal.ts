import { ref } from "vue";

export type ProfileData = { type: "agent"; agentId: string } | { type: "user" };

const visible = ref(false);
const profile = ref<ProfileData | null>(null);

export function useProfileModal() {
  function open(data: ProfileData) {
    profile.value = data;
    visible.value = true;
  }

  function close() {
    visible.value = false;
    profile.value = null;
  }

  return { visible, profile, open, close };
}
