export { default as Badge } from './Badge.vue'
import { cva, type VariantProps } from 'class-variance-authority'

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-ink',
        secondary: 'bg-[#303d45] text-[#9db3c0]',
        outline: 'border border-white/15 text-[#d4dadd]',
        destructive: 'bg-danger text-danger-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
