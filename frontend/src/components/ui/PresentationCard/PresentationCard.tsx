import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Image } from '@react-three/drei';
import * as THREE from 'three';
import styles from './PresentationCard.module.css';

const TOTAL_SLIDES = 3;

const carouselState = {
  /** Continuous progress 0 → TOTAL_SLIDES-1, driven by page scroll */
  targetProgress: 0,
  currentProgress: 0,
};

const CarouselItem = React.memo(function CarouselItem({ url, index, w, h }: { url: string; index: number; w: number; h: number }) {
  const imageRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const material = imageRef.current?.material;
    if (!material || Array.isArray(material)) return;

    const currentCameraIndex = state.camera.position.x / w;
    const distanceFromCenter = currentCameraIndex - index;
    const dist = Math.min(1, Math.abs(distanceFromCenter));

    const bezierOpacity = 1 - Math.pow(dist, 1.8);
    material.opacity = THREE.MathUtils.damp(material.opacity || 0, bezierOpacity, 8, delta);
  });

  return (
    <group position={[index * w, 0, 0]}>
      <Image
        ref={imageRef}
        scale={[w * 0.85, h * 0.85] as [number, number]}
        url={url}
        transparent
      />
    </group>
  );
});

function CarouselScene() {
  const { viewport } = useThree();
  // Capture dimensions once on mount so they never change during scroll.
  // Held in state rather than a ref because they are read during render.
  const [{ w, h }] = useState(() => ({ w: viewport.width, h: viewport.height }));

  useFrame((state, delta) => {
    carouselState.currentProgress = THREE.MathUtils.damp(
      carouselState.currentProgress,
      carouselState.targetProgress,
      5,
      delta
    );

    state.camera.position.x = carouselState.currentProgress * w;
  });

  return (
    <>
      <CarouselItem url="/assets/demo/cs1.webp" index={0} w={w} h={h} />
      <CarouselItem url="/assets/demo/cs2.webp" index={1} w={w} h={h} />
      <CarouselItem url="/assets/demo/cs3.webp" index={2} w={w} h={h} />
    </>
  );
}

export default React.memo(function PresentationCard() {
  const [isMobile, setIsMobile] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 767);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /**
   * Map page scroll position to carousel progress (0 → TOTAL_SLIDES-1).
   * The mapping uses the card's position relative to the viewport:
   *   - When the card's top edge reaches the bottom of the viewport → progress 0
   *   - When the card's bottom edge reaches the top of the viewport → progress (TOTAL_SLIDES-1)
   */
  const handleScroll = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Total travel: from card entering viewport to card leaving viewport
    const totalTravel = viewportHeight + rect.height;
    // How far along that travel we are (0 = just entering at bottom, 1 = just left at top)
    const scrolled = viewportHeight - rect.top;
    const rawProgress = scrolled / totalTravel;

    // Clamp and scale to slide range
    const clamped = Math.max(0, Math.min(1, rawProgress));
    carouselState.targetProgress = clamped * (TOTAL_SLIDES - 1);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initial position
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  if (isMobile) return null;

  return (
    <div className={styles.card} ref={cardRef}>
      <div className={styles.leftHalf}>
        <span className={styles.tag}>Skiller Pro Feature</span>
        <h2 className={styles.title}>Parallax Carousel</h2>
        <p className={styles.description}>
          Uma experiência visual imersiva. Role a página para visualizar
          o efeito de profundidade 3D (Parallax).
          Desenvolvido com React Three Fiber.
        </p>
      </div>
      <div className={styles.rightHalf}>
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }} resize={{ scroll: false }}>
          <CarouselScene />
        </Canvas>
      </div>
    </div>
  );
});

