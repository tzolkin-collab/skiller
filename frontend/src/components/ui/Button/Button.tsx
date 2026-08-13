import React from 'react';
import styles from './Button.module.css';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          styles.button,
          styles[variant],
          (disabled || isLoading) && styles.disabled,
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className={styles.spinner} size={18} />}
        {!isLoading && children}
      </button>
    );
  }
);
Button.displayName = 'Button';
