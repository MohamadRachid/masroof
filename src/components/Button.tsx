import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  block?: boolean
}

export function Button({ variant = 'secondary', size = 'md', block, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={className ? `${styles.btn} ${className}` : styles.btn}
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      {...rest}
    />
  )
}
