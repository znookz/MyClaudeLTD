import { RoundedBox } from '@react-three/drei';
import type { ChestKind, ExtraKind, HatKind, Outfit } from './utils/outfits';

/**
 * ชิ้นส่วนเครื่องแต่งกายของหุ่น (หมวก / ลายเสื้อ / ของประดับ)
 * พิกัดอ้างอิงตามชิ้นส่วนใน Agent3D:
 *   หัว  = กล่อง 0.92 × 0.68 × 0.72 (ยอดหัว y = 0.34, หน้า visor z = +0.36)
 *   ลำตัว = กล่อง 0.78 × 0.82 × 0.56 (ผิวหน้าอก z = +0.28)
 */
const HEAD_TOP = 0.34;
const CHEST_Z = 0.285;
const HALF_SPHERE = [0, Math.PI * 2, 0, Math.PI / 2] as const;

function Cloth({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={0.75} metalness={0.05} />;
}

// ============================================================
//  หมวก (วางใน group ของหัว)
// ============================================================
export function Hat({ kind, color }: { kind: HatKind; color: string }) {
  switch (kind) {
    case 'cap':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0, 0.07, -0.02]} scale={[1, 1, 0.82]} castShadow>
            <cylinderGeometry args={[0.36, 0.44, 0.16, 24]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.015, 0.46]}>
            <boxGeometry args={[0.58, 0.035, 0.34]} />
            <Cloth color={color} />
          </mesh>
        </group>
      );
    case 'hardhat':
      return (
        <group position={[0, HEAD_TOP - 0.02, 0]}>
          <mesh scale={[1, 0.62, 0.84]} castShadow>
            <sphereGeometry args={[0.48, 24, 12, ...HALF_SPHERE]} />
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.02, 0.05]} scale={[1, 1, 0.9]}>
            <cylinderGeometry args={[0.55, 0.55, 0.035, 28]} />
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <boxGeometry args={[0.1, 0.3, 0.72]} />
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} />
          </mesh>
        </group>
      );
    case 'chef':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.33, 0.33, 0.24, 24]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.36, 0]} scale={[1, 0.6, 1]} castShadow>
            <sphereGeometry args={[0.42, 20, 14]} />
            <Cloth color={color} />
          </mesh>
        </group>
      );
    case 'straw':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.68, 0.68, 0.03, 32]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.33, 0.36, 0.2, 24]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.367, 0.367, 0.06, 24]} />
            <Cloth color="#b45309" />
          </mesh>
        </group>
      );
    case 'cowboy':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0, 0.03, 0]} scale={[1, 1, 0.8]} castShadow>
            <cylinderGeometry args={[0.68, 0.62, 0.04, 32]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.18, 0]} scale={[1, 1, 0.85]}>
            <cylinderGeometry args={[0.26, 0.35, 0.3, 24]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.08, 0]} scale={[1, 1, 0.85]}>
            <cylinderGeometry args={[0.35, 0.36, 0.05, 24]} />
            <Cloth color="#fde68a" />
          </mesh>
        </group>
      );
    case 'wizard':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.6, 0.6, 0.03, 32]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.34, 0]} castShadow>
            <coneGeometry args={[0.37, 0.64, 24]} />
            <Cloth color={color} />
          </mesh>
          {[
            [0.2, 0.16, 0.24],
            [-0.14, 0.3, 0.17],
            [0.04, 0.44, 0.1],
          ].map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]}>
              <octahedronGeometry args={[0.045]} />
              <meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={1.2} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
    case 'beret':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0.08, 0.05, 0]} scale={[1, 0.3, 0.92]} rotation={[0, 0, -0.12]} castShadow>
            <sphereGeometry args={[0.46, 20, 12]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0.08, 0.2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.08, 8]} />
            <Cloth color={color} />
          </mesh>
        </group>
      );
    case 'headband':
      return (
        <group position={[0, 0.275, 0]}>
          <mesh>
            <boxGeometry args={[0.95, 0.09, 0.75]} />
            <Cloth color={color} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.07, -0.16, -0.4]} rotation={[0.35, 0, s * 0.25]}>
              <boxGeometry args={[0.08, 0.32, 0.02]} />
              <Cloth color={color} />
            </mesh>
          ))}
        </group>
      );
    case 'headphones':
      return (
        <group>
          <mesh>
            <torusGeometry args={[0.52, 0.04, 8, 28, Math.PI]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.535, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.19, 0.19, 0.12, 20]} />
              <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
            </mesh>
          ))}
        </group>
      );
    case 'tophat':
      return (
        <group position={[0, HEAD_TOP, 0]}>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.47, 0.47, 0.03, 28]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.23, 0]} castShadow>
            <cylinderGeometry args={[0.31, 0.3, 0.42, 24]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.307, 0.307, 0.07, 24]} />
            <Cloth color="#be123c" />
          </mesh>
        </group>
      );
    case 'beanie':
      return (
        <group position={[0, HEAD_TOP - 0.04, 0]}>
          <mesh scale={[1, 0.62, 0.8]} castShadow>
            <sphereGeometry args={[0.5, 24, 12, ...HALF_SPHERE]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.04, 0]} scale={[1, 1, 0.8]}>
            <cylinderGeometry args={[0.51, 0.51, 0.1, 24]} />
            <Cloth color="#f8fafc" />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/** แว่นตา (วางใน group ของหัว หน้า visor) */
export function Glasses({ color }: { color: string }) {
  return (
    <group position={[0, 0.06, 0.385]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.17, 0, 0]}>
          <torusGeometry args={[0.105, 0.016, 8, 24]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.13, 0.02, 0.02]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}

// ============================================================
//  ลายหน้าอก (วางใน group ของลำตัว)
// ============================================================
export function Chest({ kind, color }: { kind: ChestKind; color: string }) {
  switch (kind) {
    case 'tie':
    case 'bowtie':
      return (
        <group>
          <mesh position={[0, 0.1, CHEST_Z - 0.002]}>
            <boxGeometry args={[0.22, 0.58, 0.012]} />
            <Cloth color="#f8fafc" />
          </mesh>
          {kind === 'tie' ? (
            <>
              <mesh position={[0, 0.04, CHEST_Z + 0.008]}>
                <boxGeometry args={[0.08, 0.4, 0.012]} />
                <Cloth color={color} />
              </mesh>
              <mesh position={[0, 0.27, CHEST_Z + 0.01]}>
                <boxGeometry args={[0.11, 0.07, 0.016]} />
                <Cloth color={color} />
              </mesh>
            </>
          ) : (
            <>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.075, 0.3, CHEST_Z + 0.01]} rotation={[0, 0, s * 0.2]}>
                  <boxGeometry args={[0.12, 0.1, 0.02]} />
                  <Cloth color={color} />
                </mesh>
              ))}
              <mesh position={[0, 0.3, CHEST_Z + 0.016]}>
                <boxGeometry args={[0.05, 0.06, 0.02]} />
                <Cloth color={color} />
              </mesh>
            </>
          )}
        </group>
      );
    case 'zip':
      return (
        <group>
          <mesh position={[0, 0.02, CHEST_Z]}>
            <boxGeometry args={[0.028, 0.74, 0.012]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, -0.22, CHEST_Z + 0.002]}>
            <boxGeometry args={[0.46, 0.16, 0.014]} />
            <meshStandardMaterial color={color} roughness={0.8} transparent opacity={0.45} />
          </mesh>
        </group>
      );
    case 'buttons':
      return (
        <group>
          {[0.24, 0.06, -0.12].map((y) => (
            <mesh key={y} position={[0, y, CHEST_Z]}>
              <sphereGeometry args={[0.036, 10, 10]} />
              <Cloth color={color} />
            </mesh>
          ))}
        </group>
      );
    case 'stripes':
      return (
        <group>
          {[0.2, 0.02, -0.16].map((y) => (
            <mesh key={y} position={[0, y, CHEST_Z - 0.001]}>
              <boxGeometry args={[0.7, 0.075, 0.012]} />
              <Cloth color={color} />
            </mesh>
          ))}
        </group>
      );
    case 'vest':
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.2, 0, CHEST_Z - 0.001]}>
              <boxGeometry args={[0.07, 0.76, 0.012]} />
              <Cloth color={color} />
            </mesh>
          ))}
          <mesh position={[0, -0.2, CHEST_Z]}>
            <boxGeometry args={[0.72, 0.06, 0.012]} />
            <Cloth color={color} />
          </mesh>
        </group>
      );
    case 'dots':
      return (
        <group>
          {[
            [-0.22, 0.24],
            [0.1, 0.2],
            [0.26, 0.02],
            [-0.08, 0.0],
            [-0.26, -0.18],
            [0.14, -0.22],
          ].map(([x, y], i) => (
            <mesh key={i} position={[x, y, CHEST_Z - 0.01]} scale={[1, 1, 0.3]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <Cloth color={i % 2 ? '#fef08a' : color} />
            </mesh>
          ))}
        </group>
      );
    case 'emblem':
      return (
        <group position={[0, 0.1, CHEST_Z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.02, 28]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.13, 0.13, 0.02]} />
            <Cloth color="#dc2626" />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

// ============================================================
//  ของประดับที่ลำตัว (วางใน group ของลำตัว)
// ============================================================
function BodyExtra({ kind, color }: { kind: ExtraKind; color: string }) {
  switch (kind) {
    case 'cape':
      return (
        <group position={[0, 0.38, -0.31]} rotation={[0.16, 0, 0]}>
          <mesh position={[0, -0.54, 0]} castShadow>
            <boxGeometry args={[0.76, 1.08, 0.03]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0.02, 0.3]}>
            <boxGeometry args={[0.82, 0.07, 0.62]} />
            <Cloth color={color} />
          </mesh>
        </group>
      );
    case 'scarf':
      return (
        <group>
          <mesh position={[0, 0.43, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 0.95, 1]}>
            <torusGeometry args={[0.28, 0.075, 10, 28]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0.2, 0.22, 0.3]} rotation={[0, 0, -0.1]}>
            <boxGeometry args={[0.13, 0.36, 0.05]} />
            <Cloth color={color} />
          </mesh>
        </group>
      );
    case 'hood':
      return (
        <RoundedBox args={[0.76, 0.44, 0.3]} radius={0.13} smoothness={3} position={[0, 0.56, -0.4]} castShadow>
          <Cloth color={color} />
        </RoundedBox>
      );
    case 'backpack':
      return (
        <group position={[0, 0.02, -0.39]}>
          <RoundedBox args={[0.54, 0.58, 0.24]} radius={0.08} smoothness={3} castShadow>
            <Cloth color={color} />
          </RoundedBox>
          <mesh position={[0, -0.1, -0.13]}>
            <boxGeometry args={[0.34, 0.2, 0.04]} />
            <Cloth color="#7c2d12" />
          </mesh>
        </group>
      );
    case 'belt':
      return (
        <group position={[0, -0.3, 0]}>
          <mesh>
            <boxGeometry args={[0.8, 0.08, 0.58]} />
            <Cloth color={color} />
          </mesh>
          <mesh position={[0, 0, 0.295]}>
            <boxGeometry args={[0.13, 0.1, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/** ลายเสื้อ + ของประดับทั้งหมดที่ติดกับลำตัว */
export function BodyWear({ outfit }: { outfit: Outfit }) {
  return (
    <>
      <Chest kind={outfit.chest} color={outfit.chestColor} />
      {outfit.extras.map((e) => (
        <BodyExtra key={e} kind={e} color={outfit.extraColor} />
      ))}
    </>
  );
}

/** หมวก + แว่น ที่ติดกับหัว */
export function HeadWear({ outfit }: { outfit: Outfit }) {
  return (
    <>
      <Hat kind={outfit.hat} color={outfit.hatColor} />
      {outfit.extras.includes('glasses') && <Glasses color={outfit.extraColor} />}
    </>
  );
}
