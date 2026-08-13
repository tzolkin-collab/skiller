'use client';
import { motion } from 'framer-motion';

export function Logo({ className = "", size = 40, style }: { className?: string; size?: number; style?: React.CSSProperties }) {
  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => {
      const delay = i * 0.1;
      return {
        pathLength: 1,
        opacity: 1,
        transition: {
          pathLength: { delay, type: "spring" as const, duration: 0.8, bounce: 0 },
          opacity: { delay, duration: 0.01 }
        }
      };
    }
  };

  const containerHover = {
    hover: { 
      rotate: [-2, 3, -1, 0],
      scale: 1.15,
      filter: "drop-shadow(0 0 12px rgba(255, 0, 60, 1))",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transition: { duration: 0.3, ease: "easeOut" as any } 
    }
  };

  const smokeHover = {
    hover: { 
      scale: [1, 1.2, 1],
      opacity: [0.5, 0.2, 0.5],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transition: { repeat: Infinity, duration: 2, ease: "easeInOut" as any } 
    }
  };

  return (
    <motion.svg 
      width={size} 
      height={size} 
      viewBox="0 0 48 48" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: 'visible', ...style }}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      variants={containerHover}
    >
      {/* Smoke - Minimalist lines */}
      <motion.path 
        d="M16 12C16 8 20 6 20 2" 
        stroke="currentColor" strokeWidth="3" strokeLinecap="square" 
        variants={{ ...draw, ...smokeHover }} custom={1} 
      />
      <motion.path 
        d="M24 14C24 9 28 7 28 3" 
        stroke="currentColor" strokeWidth="3" strokeLinecap="square" 
        variants={{ ...draw, ...smokeHover }} custom={2}
      />
      <motion.path 
        d="M32 12C32 8 36 6 36 2" 
        stroke="currentColor" strokeWidth="3" strokeLinecap="square" 
        variants={{ ...draw, ...smokeHover }} custom={3}
      />
      
      {/* Cup Body - Sharp and clean */}
      <motion.path 
        d="M8 18H36V30C36 35.5 31.5 40 26 40H18C12.5 40 8 35.5 8 30V18Z" 
        fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter"
        variants={draw} custom={0}
      />
      
      {/* Cup Handle - Sharp corners */}
      <motion.path 
        d="M36 22H42C44.2 22 46 23.8 46 26V28C46 30.2 44.2 32 42 32H35" 
        stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"
        variants={draw} custom={0.5}
      />
    </motion.svg>
  );
}
