// @ts-nocheck
import * as THREE from 'three';
import { useRef, useState, useEffect, memo } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import {
  useFBO,
  useGLTF,
  Scroll,
  Preload,
  ScrollControls,
  MeshTransmissionMaterial,
  Text,
  RoundedBox
} from '@react-three/drei';
import { easing } from 'maath';

interface NavItem {
  label: string;
  link: string;
}

/** Per-mode overrides forwarded to the transmission material / mesh. */
interface FluidGlassModeProps {
  navItems?: NavItem[];
  scale?: number;
  ior?: number;
  thickness?: number;
  chromaticAberration?: number;
  anisotropy?: number;
  color?: string;
  [key: string]: unknown;
}

interface FluidGlassProps {
  mode?: 'lens' | 'bar' | 'cube';
  lensProps?: FluidGlassModeProps;
  barProps?: FluidGlassModeProps;
  cubeProps?: FluidGlassModeProps;
  children?: React.ReactNode;
}

export default function FluidGlass({ mode = 'lens', lensProps = {}, barProps = {}, cubeProps = {} }: FluidGlassProps) {
  const Wrapper = mode === 'bar' ? Bar : mode === 'cube' ? Cube : Lens;
  const rawOverrides = mode === 'bar' ? barProps : mode === 'cube' ? cubeProps : lensProps;

  const {
    navItems = [
      { label: 'Home', link: '' },
      { label: 'About', link: '' },
      { label: 'Contact', link: '' }
    ],
    ...modeProps
  } = rawOverrides;

  return (
    <Canvas camera={{ position: [0, 0, 20], fov: 15 }} gl={{ alpha: true }}>
      {/* Ambient and Directional Light for premium materials */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />

      <ScrollControls damping={0.2} pages={3} distance={0.4}>
        {mode === 'bar' && <NavItems items={navItems} />}
        <Wrapper modeProps={modeProps}>
          <Scroll>
            <PricingTitle />
            <PricingCards />
          </Scroll>
          <Preload />
        </Wrapper>
      </ScrollControls>
    </Canvas>
  );
}

const ModeWrapper = memo(function ModeWrapper({
  children,
  glb,
  geometryKey,
  lockToBottom = false,
  followPointer = true,
  modeProps = {},
  ...props
}) {
  const ref = useRef();
  const { nodes } = useGLTF(glb);
  const buffer = useFBO();
  const { viewport: vp } = useThree();
  const [scene] = useState(() => new THREE.Scene());
  const geoWidthRef = useRef(1);

  useEffect(() => {
    const geo = nodes[geometryKey]?.geometry;
    if (geo) {
      geo.computeBoundingBox();
      geoWidthRef.current = geo.boundingBox.max.x - geo.boundingBox.min.x || 1;
    }
  }, [nodes, geometryKey]);

  useFrame((state, delta) => {
    const { gl, viewport, pointer, camera } = state;
    const v = viewport.getCurrentViewport(camera, [0, 0, 15]);

    const destX = followPointer ? (pointer.x * v.width) / 2 : 0;
    const destY = lockToBottom ? -v.height / 2 + 0.2 : followPointer ? (pointer.y * v.height) / 2 : 0;
    easing.damp3(ref.current.position, [destX, destY, 15], 0.15, delta);

    if (modeProps.scale == null) {
      const maxWorld = v.width * 0.9;
      const desired = maxWorld / geoWidthRef.current;
      ref.current.scale.setScalar(Math.min(0.15, desired));
    }

    gl.setRenderTarget(buffer);
    gl.render(scene, camera);
    gl.setRenderTarget(null);

    // Background Color
    gl.setClearColor(0x0a0a0a, 1);
  });

  const { scale, ior, thickness, anisotropy, chromaticAberration, ...extraMat } = modeProps;

  return (
    <>
      {createPortal(children, scene)}
      <mesh scale={[vp.width, vp.height, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} transparent />
      </mesh>
      <mesh ref={ref} scale={scale ?? 0.15} rotation-x={Math.PI / 2} geometry={nodes[geometryKey]?.geometry} {...props}>
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={ior ?? 1.15}
          thickness={thickness ?? 5}
          anisotropy={anisotropy ?? 0.01}
          chromaticAberration={chromaticAberration ?? 0.1}
          {...extraMat}
        />
      </mesh>
    </>
  );
});

function Lens({ modeProps, ...p }) {
  return <ModeWrapper glb="/assets/3d/lens.glb" geometryKey="Cylinder" followPointer modeProps={modeProps} {...p} />;
}

function Cube({ modeProps, ...p }) {
  return <ModeWrapper glb="/assets/3d/cube.glb" geometryKey="Cube" followPointer modeProps={modeProps} {...p} />;
}

function Bar({ modeProps = {}, ...p }) {
  const defaultMat = {
    transmission: 1,
    roughness: 0,
    thickness: 10,
    ior: 1.15,
    color: '#ffffff',
    attenuationColor: '#ffffff',
    attenuationDistance: 0.25
  };

  return (
    <ModeWrapper
      glb="/assets/3d/bar.glb"
      geometryKey="Cube"
      lockToBottom
      followPointer={false}
      modeProps={{ ...defaultMat, ...modeProps }}
      {...p}
    />
  );
}

function NavItems({ items }) {
  const group = useRef();
  const { viewport, camera } = useThree();

  const DEVICE = {
    mobile: { max: 639, spacing: 0.2, fontSize: 0.035 },
    tablet: { max: 1023, spacing: 0.24, fontSize: 0.035 },
    desktop: { max: Infinity, spacing: 0.3, fontSize: 0.035 }
  };
  const getDevice = () => {
    const w = window.innerWidth;
    return w <= DEVICE.mobile.max ? 'mobile' : w <= DEVICE.tablet.max ? 'tablet' : 'desktop';
  };

  const [device, setDevice] = useState(getDevice());

  useEffect(() => {
    const onResize = () => setDevice(getDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { spacing, fontSize } = DEVICE[device];

  useFrame(() => {
    if (!group.current) return;
    const v = viewport.getCurrentViewport(camera, [0, 0, 15]);
    group.current.position.set(0, -v.height / 2 + 0.2, 15.1);

    group.current.children.forEach((child, i) => {
      child.position.x = (i - (items.length - 1) / 2) * spacing;
    });
  });

  const handleNavigate = link => {
    if (!link) return;
    window.location.assign(link);
  };

  return (
    <group ref={group} renderOrder={10}>
      {items.map(({ label, link }) => (
        <Text
          key={label}
          fontSize={fontSize}
          color="white"
          anchorX="center"
          anchorY="middle"
          depthWrite={false}
          outlineWidth={0}
          outlineBlur="20%"
          outlineColor="#000"
          outlineOpacity={0.5}
          depthTest={false}
          renderOrder={10}
          onClick={e => {
            e.stopPropagation();
            handleNavigate(link);
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = 'auto')}
        >
          {label}
        </Text>
      ))}
    </group>
  );
}

function PricingCards() {
  const group = useRef();
  
  // Responsive Layout
  const getDevice = () => {
    if (typeof window === 'undefined') return 'desktop';
    const w = window.innerWidth;
    return w <= 639 ? 'mobile' : w <= 1023 ? 'tablet' : 'desktop';
  };
  const [device, setDevice] = useState(getDevice());

  useEffect(() => {
    const onResize = () => setDevice(getDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const LAYOUT = {
    mobile: { 
      groupPos: [0, -0.2, 12], 
      starterPos: [0, 3.2, 0], 
      proPos: [0, -3.2, 0], 
      enterprisePos: [0, -9.6, 0],
      scale: 0.16 
    },
    tablet: { 
      groupPos: [0, 0, 12], 
      starterPos: [-2.2, 0, 0], 
      proPos: [2.2, 0, 0], 
      enterprisePos: [0, -6.5, 0],
      scale: 0.23 
    },
    desktop: { 
      groupPos: [0, 0, 12], 
      starterPos: [-2.4, 0, 0], 
      proPos: [2.4, 0, 0], 
      enterprisePos: [0, -6.8, 0],
      scale: 0.25 
    }
  };

  const { groupPos, starterPos, proPos, enterprisePos, scale } = LAYOUT[device];

  // Handlers for interaction
  const handlePointerOver = () => (document.body.style.cursor = 'pointer');
  const handlePointerOut = () => (document.body.style.cursor = 'auto');
  const handleSelect = (plan: string) => {
    if (plan === 'enterprise') {
      window.location.href = '/pt/contact';
    } else {
      window.location.href = '/pt/dashboard';
    }
  };

  return (
    <group ref={group} position={groupPos} scale={scale}>
      {/* --- STARTER CARD --- */}
      <group position={starterPos}>
        {/* Glowing Ambient Border */}
        <RoundedBox args={[4.56, 6.06, 0.05]} radius={0.2} position={[0, 0, -0.1]}>
          <meshBasicMaterial color="#333333" opacity={0.3} transparent />
        </RoundedBox>

        {/* Card Background */}
        <RoundedBox args={[4.5, 6, 0.1]} radius={0.2}>
          <meshPhysicalMaterial color="#111111" roughness={0.7} metalness={0.2} />
        </RoundedBox>
        
        {/* Category & Title */}
        <Text position={[0, 2.3, 0.1]} fontSize={0.15} color="#666666" anchorX="center" letterSpacing={0.1}>B2C / PARA INICIANTES</Text>
        <Text position={[0, 1.8, 0.1]} fontSize={0.4} color="#dddddd" anchorX="center" fontWeight="bold">STARTER</Text>
        
        <group position={[0, 0.9, 0.1]}>
          <Text anchorX="right" position={[-0.02, 0, 0]} fontSize={0.7} color="#ffffff" letterSpacing={-0.05}>$9</Text>
          <Text anchorX="left" position={[0.02, -0.15, 0]} fontSize={0.3} color="#888888">/mo</Text>
        </group>

        {/* Features Divider */}
        <mesh position={[0, 0.3, 0.1]}>
          <planeGeometry args={[3.5, 0.02]} />
          <meshBasicMaterial color="#333333" />
        </mesh>

        {/* Features List */}
        <Text position={[-1.2, -0.2, 0.1]} fontSize={0.2} color="#aaaaaa" anchorX="left" lineHeight={1.8}>
          •  Unlimited Public Extractions{'\n'}
          •  Generic AI Prompts{'\n'}
          •  Standard Generation Speed
        </Text>

        {/* Button */}
        <group position={[0, -2, 0.1]} onClick={() => handleSelect('free')} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <RoundedBox args={[3.5, 0.8, 0.05]} radius={0.1}>
            <meshPhysicalMaterial color="#1A1A1A" roughness={0.5} metalness={0.5} />
          </RoundedBox>
          <Text position={[0, 0, 0.05]} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="middle">GET STARTED</Text>
        </group>
      </group>

      {/* --- PRO CARD --- */}
      <group position={proPos}>
        {/* Glowing Red Border */}
        <RoundedBox args={[4.6, 6.1, 0.05]} radius={0.2} position={[0, 0, -0.1]}>
          <meshBasicMaterial color="#FF003C" opacity={0.6} transparent />
        </RoundedBox>

        {/* Card Background */}
        <RoundedBox args={[4.5, 6, 0.1]} radius={0.2}>
          <meshPhysicalMaterial color="#141011" roughness={0.4} metalness={0.8} />
        </RoundedBox>
        
        {/* Category & Title */}
        <Text position={[0, 2.3, 0.1]} fontSize={0.15} color="#FF003C" anchorX="center" letterSpacing={0.1}>B2C / PARA PROFISSIONAIS</Text>
        <Text position={[0, 1.8, 0.1]} fontSize={0.4} color="#ffffff" anchorX="center" fontWeight="bold">SKILLER PRO</Text>
        
        <group position={[0, 0.9, 0.1]}>
          <Text anchorX="right" position={[-0.02, 0, 0]} fontSize={0.7} color="#ffffff" letterSpacing={-0.05}>$19</Text>
          <Text anchorX="left" position={[0.02, -0.15, 0]} fontSize={0.3} color="#888888">/mo</Text>
        </group>

        {/* Features Divider */}
        <mesh position={[0, 0.3, 0.1]}>
          <planeGeometry args={[3.5, 0.02]} />
          <meshBasicMaterial color="#4A1520" />
        </mesh>

        {/* Features List */}
        <Text position={[-1.2, -0.2, 0.1]} fontSize={0.2} color="#dddddd" anchorX="left" lineHeight={1.8}>
          •  MCP Namespaces{'\n'}
          •  Cloud Hosting (Proxy){'\n'}
          •  Unlimited Extractions{'\n'}
          •  Priority Support
        </Text>

        {/* Button */}
        <group position={[0, -2, 0.1]} onClick={() => handleSelect('pro')} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
          <RoundedBox args={[3.5, 0.8, 0.05]} radius={0.1}>
            <meshPhysicalMaterial color="#FF003C" roughness={0.3} metalness={0.4} />
          </RoundedBox>
          <Text position={[0, 0, 0.05]} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="middle" fontWeight="bold">UPGRADE NOW</Text>
        </group>
      </group>

      {/* --- ENTERPRISE CARD --- */}
      <group position={enterprisePos}>
        {/* Glowing Cyan Border */}
        <RoundedBox args={[8.1, 4.1, 0.05]} radius={0.2} position={[0, 0, -0.1]}>
          <meshBasicMaterial color="#06B6D4" opacity={0.4} transparent />
        </RoundedBox>

        {/* Card Background */}
        <RoundedBox args={[8.0, 4, 0.1]} radius={0.2}>
          <meshPhysicalMaterial color="#0A1115" roughness={0.6} metalness={0.5} />
        </RoundedBox>
        
        {/* Left Column (Info) */}
        <group position={[-2, 0, 0.1]}>
          <Text position={[0, 1.2, 0]} fontSize={0.15} color="#06B6D4" anchorX="center" letterSpacing={0.1}>B2B / PARA EQUIPES</Text>
          <Text position={[0, 0.7, 0]} fontSize={0.45} color="#ffffff" anchorX="center" fontWeight="bold">ENTERPRISE</Text>
          <Text position={[0, -0.1, 0]} fontSize={0.6} color="#ffffff" anchorX="center" letterSpacing={-0.03}>Custom</Text>
          
          {/* Button */}
          <group position={[0, -1.2, 0]} onClick={() => handleSelect('enterprise')} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
            <RoundedBox args={[3.2, 0.8, 0.05]} radius={0.1}>
              <meshPhysicalMaterial color="#06B6D4" roughness={0.3} metalness={0.4} />
            </RoundedBox>
            <Text position={[0, 0, 0.05]} fontSize={0.2} color="#000000" anchorX="center" anchorY="middle" fontWeight="bold">CONTACT SALES</Text>
          </group>
        </group>

        {/* Vertical Divider */}
        <mesh position={[0, 0, 0.1]}>
          <planeGeometry args={[0.02, 3]} />
          <meshBasicMaterial color="#163A45" />
        </mesh>

        {/* Right Column (Features) */}
        <Text position={[0.5, 0.8, 0.1]} fontSize={0.22} color="#ffffff" anchorX="left">Everything in Pro, plus:</Text>
        <Text position={[0.5, -0.2, 0.1]} fontSize={0.18} color="#cccccc" anchorX="left" lineHeight={2}>
          •  Dedicated Infrastructure{'\n'}
          •  SSO & SAML Auth{'\n'}
          •  Custom LLM Connectors{'\n'}
          •  Custom Integrations{'\n'}
          •  Dedicated Account Manager
        </Text>
      </group>
    </group>
  );
}

function PricingTitle() {
  const DEVICE = {
    mobile: { fontSize: 0.3, y: 3 },
    tablet: { fontSize: 0.5, y: 3.5 },
    desktop: { fontSize: 0.7, y: 4.5 }
  };
  const getDevice = () => {
    const w = window.innerWidth;
    return w <= 639 ? 'mobile' : w <= 1023 ? 'tablet' : 'desktop';
  };

  const [device, setDevice] = useState(getDevice());

  useEffect(() => {
    const onResize = () => setDevice(getDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { fontSize, y } = DEVICE[device];

  return (
    <group position={[0, y, 12]}>
      <Text
        fontSize={fontSize}
        letterSpacing={-0.04}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        Choose Your Weapon
      </Text>
      <Text
        position={[0, -0.8, 0]}
        fontSize={0.2}
        color="#888888"
        anchorX="center"
        anchorY="middle"
      >
        Start free, upgrade when you need unlimited power.
      </Text>
    </group>
  );
}
