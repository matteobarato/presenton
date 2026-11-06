export { default as Alert } from './Alert.vue'
export { default as AlertTitle } from './AlertTitle.vue'
export { default as AlertDescription } from './AlertDescription.vue'
import { cva, type VariantProps } from 'class-variance-authority'

export const alertVariants = cva(
  'relative w-full rounded-card border px-4 py-3',
  {
    variants: {
      variant: {
        default: 'border-line bg-secondary text-secondary-text',
        destructive: 'border-[#f4c0bc33] bg-danger text-danger-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)
export type AlertVariants = VariantProps<typeof alertVariants>
