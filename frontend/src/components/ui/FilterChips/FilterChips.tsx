import React from 'react';
import styles from './FilterChips.module.css';

interface FilterChipsProps {
  chips: string[];
  activeChip: string;
  onSelectChip: (chip: string) => void;
  disabled?: boolean;
}

export function FilterChips({ chips, activeChip, onSelectChip, disabled }: FilterChipsProps) {
  return (
    <div className={styles.container}>
      {chips.map((chip) => (
        <button
          key={chip}
          className={`${styles.chip} ${activeChip === chip ? styles.active : ''}`}
          onClick={() => onSelectChip(chip)}
          disabled={disabled}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
