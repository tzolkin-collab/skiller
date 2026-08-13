import React from 'react';
import styles from './Progress.module.css';
import { clsx } from 'clsx';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function Progress({ className, value, ...props }: ProgressProps) {
  const safeValue = Math.min(Math.max(value, 0), 100);
  
  return (
    <div className={clsx(styles.progress, className)} {...props}>
      <div 
        className={styles.indicator} 
        style={{ transform: `translateX(-${100 - safeValue}%)` }} 
      />
    </div>
  );
}
