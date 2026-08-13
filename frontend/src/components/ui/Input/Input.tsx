import React from 'react';
import styles from './Input.module.css';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className={styles.wrapper}>
        <input
          ref={ref}
          className={clsx(
            styles.input,
            error && styles.errorState,
            className
          )}
          {...props}
        />
        {error && <p className={styles.errorMessage}>{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
