'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Seeded PRNG (mulberry32). The dust layer needs scattered positions, but
 * `Math.random()` during render is impure — unstable across re-renders and
 * across server/client. Seeding it keeps the scene identical every time.
 */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Particles removed per user request

interface BrutalistShapeProps {
  position: [number, number, number];
  scale: number;
  color: string;
  wireframe: boolean;
  /** < 1 drifts slower than the page scroll, > 1 faster. */
  scrollSpeed: number;
}

// A Brutalist shape that floats and reacts to scroll
function BrutalistShape({ position, scale, color, wireframe, scrollSpeed }: BrutalistShapeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const initialY = position[1];

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // Constant slow rotation
    meshRef.current.rotation.x += delta * 0.1;
    meshRef.current.rotation.y += delta * 0.15;
    
    // Scroll interaction
    const scrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    
    // Move up/down based on scroll (Parallax effect)
    // scrollSpeed < 1 = slower than scroll, scrollSpeed > 1 = faster than scroll
    const scrollOffset = (scrollY / viewportHeight) * scrollSpeed;
    
    // Smooth damp towards the new scroll position
    meshRef.current.position.y = THREE.MathUtils.damp(
      meshRef.current.position.y, 
      initialY + scrollOffset, 
      4, 
      delta
    );
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <icosahedronGeometry args={[1, 0]} />
      {wireframe ? (
        <meshBasicMaterial color={color} wireframe />
      ) : (
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.8} />
      )}
    </mesh>
  );
}

// FloatingParticles component removed per user request

export function GlobalScene() {
  const { viewport } = useThree();
  
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
      <directionalLight position={[-10, -10, -5]} intensity={1} color="#FF003C" />



      {/* Brutalist Shapes - Foreground/Background Layering */}
      
      {/* Top Left - Wireframe */}
      <BrutalistShape 
        position={[-viewport.width * 0.3, viewport.height * 0.3, -2]} 
        scale={1.5} 
        color="#333333" 
        wireframe={true} 
        scrollSpeed={2} // Moves fast when scrolling
      />

      {/* The dark bottom-left mass and the footer shape were removed: the
          landing no longer scrolls, so `scrollSpeed` never moves anything and
          both sat parked in the lower half of the frame. */}
    </>
  );
}
