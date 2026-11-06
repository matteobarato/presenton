import { cva, type VariantProps } from 'class-variance-authority'
export { default as Button } from './Button.vue'
export const buttonVariants = cva('ui-button', { variants: { variant: { default: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', outline: 'button-outline', destructive: 'button-destructive' }, size: { default: 'button-md', sm: 'button-sm', icon: 'button-icon' } }, defaultVariants: { variant: 'default', size: 'default' } })
export type ButtonVariants = VariantProps<typeof buttonVariants>
