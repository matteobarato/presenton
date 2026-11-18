import { defineComponent, h, type Component } from 'vue'
import PanelBody from './PanelBody.vue'

/**
 * Wraps an inspector Section so it sits in a popover without the sidebar padding: `panel` items pass
 * `framed(SomeSection)` as their `component`. Props pass through to the Section. Call once at module level.
 */
export function framed(section: Component): Component {
  return defineComponent({
    name: 'FramedPanel',
    inheritAttrs: false,
    setup: (_, { attrs }) => () => h(PanelBody, null, { default: () => h(section, attrs) }),
  })
}
