import type { Component } from 'vue'
import { Globe, ImageIcon, KeyRound, Type, UserRound, Users } from 'lucide-vue-next'
import type { SettingsSection } from './types'

/** One glyph per settings section, shared by the sidebar and the section title. */
export const SECTION_ICONS: Record<SettingsSection, Component> = {
  text: Type,
  images: ImageIcon,
  'web-search': Globe,
  users: Users,
  'api-keys': KeyRound,
  account: UserRound,
}
