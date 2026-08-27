'use client';

import { useThree } from '@react-three/fiber';

export function GlobalScene() {
  // Mantém o hook para que o Canvas não quebre se outros componentes
  // forem adicionados depois — `useThree` é barato sem geometria.
  useThree();

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
      <directionalLight position={[-10, -10, -5]} intensity={1} color="#FF003C" />
    </>
  );
}
