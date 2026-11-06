export { default as Button } from './Button.vue'
import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-button border border-transparent text-[12px] font-semibold tracking-[-0.01em] whitespace-nowrap transition-[background,color,border-color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-35',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-ink hover:bg-accent-hover hover:shadow-[0_3px_15px_#b2dced17] active:translate-y-px',
        secondary: 'bg-secondary text-secondary-text hover:bg-secondary-hover',
        ghost: 'bg-transparent text-muted hover:bg-white/[0.04] hover:text-[#f6f8f9]',
        outline: 'border-white/[0.09] bg-transparent text-[#d4dadd] hover:border-white/[0.16] hover:bg-white/[0.03]',
        destructive: 'bg-danger text-danger-text hover:bg-[#6a3131]',
      },
      size: {
        default: 'h-[37px] px-3.5',
        sm: 'h-[30px] px-2.5 text-[11px]',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
