import { ref } from 'vue'

// One help dialog for the whole app: the rail, the footer and "?" all open it.
const open = ref(false)

export function useHelpDialog() {
  return { open, show: () => (open.value = true) }
}
