import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Vector3, Euler, CanvasTexture, RepeatWrapping } from 'three';
import { Text } from '@react-three/drei';
import { COLORS, LOCATIONS, WorkerState, EARNINGS_PER_PAPER, Order } from '../types';

interface OfficeSceneProps {
  paperCount: number;
  processedCount: number; 
  workerState: WorkerState;
  assistantState: WorkerState;
  isJanitorDoorOpen?: boolean;
  isAssistantDoorOpen?: boolean;
  orders: Order[];
  isClawDropping?: boolean;
  droppedCount?: number;
  metrics: {
      efficiency: number;
      revenue: number;
      throughput: number;
  }
}

const CarpetFloor = () => {
    const texture = useMemo(() => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (context) {
            // Background (Light Green)
            context.fillStyle = '#66bb6a'; 
            context.fillRect(0, 0, size, size);
            
            // Tiles (Dark Green)
            context.fillStyle = '#388e3c'; 
            
            const tiles = 4; // 4x4 grid on the texture unit
            const step = size / tiles;
            
            for (let y = 0; y < tiles; y++) {
                for (let x = 0; x < tiles; x++) {
                    if ((x + y) % 2 === 0) {
                        context.fillRect(x * step, y * step, step, step);
                    }
                }
            }
        }
        const tex = new CanvasTexture(canvas);
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.repeat.set(20, 20); // Repeat across the large floor for small tiles
        return tex;
    }, []);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial map={texture} roughness={0.9} />
        </mesh>
    );
};

const Chair = ({ isSitting, position = [0, 0, 0.5], rotation = [0, 0, 0] }: { isSitting: boolean, position?: [number, number, number], rotation?: [number, number, number] }) => {
  const groupRef = useRef<Group>(null);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Determine offset direction based on rotation
    // Chair faces +LocalZ. Backwards is -LocalZ.
    const targetOffsetZ = isSitting ? 0 : -0.7;
    
    // Calculate global displacement vector for "backing out"
    const euler = new Euler(rotation[0], rotation[1], rotation[2]);
    const offsetVec = new Vector3(0, 0, targetOffsetZ).applyEuler(euler);
    
    const targetPos = new Vector3(position[0], position[1], position[2]).add(offsetVec);
    
    groupRef.current.position.lerp(targetPos, delta * 4);
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
        {/* Chair Model */}
        <group>
            <mesh position={[0, 0.3, 0]} castShadow>
                <boxGeometry args={[0.6, 0.1, 0.6]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0, 0.6, -0.25]} rotation={[-0.1, 0, 0]} castShadow>
                <boxGeometry args={[0.6, 0.6, 0.1]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0, 0.15, 0]} castShadow>
                  <cylinderGeometry args={[0.05, 0.05, 0.3]} />
                  <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0, 0.02, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.3, 0.05]} />
                  <meshStandardMaterial color="#111" />
            </mesh>
        </group>
    </group>
  );
};

const TapePlayer = ({ isPlaying }: { isPlaying: boolean }) => {
    const leftReelRef = useRef<Group>(null);
    const rightReelRef = useRef<Group>(null);

    useFrame((state, delta) => {
        if (isPlaying) {
            const speed = 2;
            if (leftReelRef.current) leftReelRef.current.rotation.z -= delta * speed;
            if (rightReelRef.current) rightReelRef.current.rotation.z -= delta * speed;
        }
    });

    const Reel = ({ x }: { x: number }) => (
        <group position={[x, 0.16, 0]} rotation={[Math.PI/2, 0, 0]}>
             <mesh>
                 <cylinderGeometry args={[0.06, 0.06, 0.01]} />
                 <meshStandardMaterial color="#111" />
             </mesh>
             <mesh position={[0, 0.01, 0]}>
                 <cylinderGeometry args={[0.02, 0.02, 0.01]} />
                 <meshStandardMaterial color="#fff" />
             </mesh>
        </group>
    )

    return (
        <group position={[-0.8, 0.75, -0.2]} rotation={[0, 0.2, 0]}>
            {/* Main Body */}
            <mesh castShadow position={[0, 0.075, 0]}>
                <boxGeometry args={[0.6, 0.15, 0.4]} />
                <meshStandardMaterial color={COLORS.TAPE_PLAYER} />
            </mesh>
            {/* Deck Window */}
            <mesh position={[0, 0.151, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[0.4, 0.25]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            {/* Buttons */}
            <group position={[0, 0.16, 0.15]}>
                {[...Array(4)].map((_, i) => (
                    <mesh key={i} position={[(i-1.5)*0.1, 0, 0]}>
                        <boxGeometry args={[0.08, 0.02, 0.05]} />
                        <meshStandardMaterial color={i===3 && isPlaying ? "#2ecc71" : "#bdc3c7"} />
                    </mesh>
                ))}
            </group>

            {/* Simulated Tape Inside */}
            <group ref={leftReelRef}><Reel x={-0.1} /></group>
            <group ref={rightReelRef}><Reel x={0.1} /></group>
        </group>
    )
}

const Laptop = ({ workerState, isOpen = true }: { workerState: WorkerState, isOpen?: boolean }) => {
    const groupRef = useRef<Group>(null);

    useFrame((state, delta) => {
        if(!groupRef.current) return;
        
        // If working (writing), slide laptop to the right to make space. Only applies to Main Desk logic really.
        const isWriting = workerState === WorkerState.WORKING;
        const targetX = isWriting ? 0.6 : 0;
        
        groupRef.current.position.x = MathUtils.lerp(groupRef.current.position.x, targetX, delta * 5);
    });

    return (
        <group ref={groupRef} position={[0, 0.75, -0.4]} rotation={[0, Math.PI, 0]}> 
            {/* Base */}
            <mesh position={[0, 0.01, 0]}>
                <boxGeometry args={[0.4, 0.02, 0.3]} />
                <meshStandardMaterial color="#95a5a6" />
            </mesh>
            {/* Screen */}
            <mesh position={[0, 0.15, -0.15]} rotation={[isOpen ? 0.2 : Math.PI/2, 0, 0]}>
                <boxGeometry args={[0.4, 0.3, 0.01]} />
                <meshStandardMaterial color="#95a5a6" />
            </mesh>
            <mesh position={[0, 0.15, -0.14]} rotation={[isOpen ? 0.2 : Math.PI/2, 0, 0]}>
                <planeGeometry args={[0.38, 0.28]} />
                <meshBasicMaterial color="#000" />
            </mesh>
        </group>
    );
};

const GameController = () => (
    <group position={[0.4, 0.76, 0.5]} rotation={[0, -0.5, 0]}>
        <mesh castShadow>
            <boxGeometry args={[0.15, 0.02, 0.1]} />
            <meshStandardMaterial color="#ecf0f1" />
        </mesh>
        {/* Buttons */}
        <mesh position={[0.04, 0.02, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.02]} />
            <meshStandardMaterial color="#e74c3c" />
        </mesh>
        <mesh position={[-0.04, 0.02, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.02]} />
            <meshStandardMaterial color="#2c3e50" />
        </mesh>
    </group>
)

const Plant = ({ position }: { position: [number, number, number] }) => (
    <group position={position}>
        <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.15, 0.5]} />
            <meshStandardMaterial color="#8e44ad" />
        </mesh>
        <group position={[0, 0.5, 0]}>
            <mesh position={[0, 0.2, 0]} rotation={[0,0.5,0]}>
                 <boxGeometry args={[0.1, 0.4, 0.1]} />
                 <meshStandardMaterial color="#27ae60" />
            </mesh>
             <mesh position={[0.1, 0.1, 0]} rotation={[0,0, -0.5]}>
                 <boxGeometry args={[0.1, 0.3, 0.1]} />
                 <meshStandardMaterial color="#27ae60" />
            </mesh>
             <mesh position={[-0.1, 0.15, 0]} rotation={[0,0, 0.5]}>
                 <boxGeometry args={[0.1, 0.3, 0.1]} />
                 <meshStandardMaterial color="#2ecc71" />
            </mesh>
        </group>
    </group>
)

const Whiteboard = () => {
    return (
        <group position={[0, 2.0, -4.9]}>
            {/* Frame */}
            <mesh position={[0, 0, 0]} receiveShadow>
                <boxGeometry args={[3.2, 2.2, 0.1]} />
                <meshStandardMaterial color={COLORS.WHITEBOARD_FRAME} />
            </mesh>
            {/* Board Surface */}
            <mesh position={[0, 0, 0.06]}>
                <boxGeometry args={[3.0, 2.0, 0.02]} />
                <meshStandardMaterial color={COLORS.WHITEBOARD_SURFACE} />
            </mesh>
            {/* Tray */}
            <mesh position={[0, -1.1, 0.1]}>
                 <boxGeometry args={[3.0, 0.1, 0.2]} />
                 <meshStandardMaterial color={COLORS.WHITEBOARD_FRAME} />
            </mesh>
            {/* Markers */}
            <mesh position={[-0.5, -1.08, 0.15]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.3]} />
                <meshStandardMaterial color="red" />
            </mesh>
             <mesh position={[-0.1, -1.08, 0.15]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.3]} />
                <meshStandardMaterial color="blue" />
            </mesh>
             <mesh position={[0.3, -1.08, 0.15]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.3]} />
                <meshStandardMaterial color="black" />
            </mesh>

            {/* Content */}
            <group position={[-1.3, 0.8, 0.08]}>
                 <Text 
                    color="black" 
                    fontSize={0.25} 
                    anchorX="left" 
                    anchorY="top"
                 >
                    GOALS:
                 </Text>
                 <Text position={[0, -0.35, 0]} color="black" fontSize={0.18} anchorX="left" anchorY="top">
                    1. Process Orders
                 </Text>
                 <Text position={[0, -0.65, 0]} color="black" fontSize={0.18} anchorX="left" anchorY="top">
                    2. Serve 100 Clients
                 </Text>
                 <Text position={[0, -0.95, 0]} color="black" fontSize={0.18} anchorX="left" anchorY="top">
                    3. Hydrate Plants
                 </Text>
                 <Text position={[0, -1.25, 0]} color="black" fontSize={0.18} anchorX="left" anchorY="top">
                    4. Avoid Burnout
                 </Text>
            </group>
        </group>
    )
}

const TapeArchive = ({ count }: { count: number }) => (
    <group position={[6.5, 0, -4.5]}>
       {/* Rack */}
       <mesh position={[0, 1, 0]} castShadow receiveShadow>
           <boxGeometry args={[1.2, 2.0, 0.4]} />
           <meshStandardMaterial color={COLORS.ARCHIVE_RACK} />
       </mesh>
       {/* Shelves */}
       {[0.4, 0.8, 1.2, 1.6].map(y => (
           <mesh key={y} position={[0, y, 0.2]} castShadow>
               <boxGeometry args={[1.1, 0.02, 0.35]} />
               <meshStandardMaterial color="#333" />
           </mesh>
       ))}
       {/* Tapes */}
       {Array.from({length: Math.min(count, 32)}).map((_, i) => (
           <mesh key={i} position={[
               -0.45 + (i % 4) * 0.3, 
               0.45 + Math.floor(i / 4) * 0.4, 
               0.25
           ]} rotation={[0,0,0]} castShadow>
               <boxGeometry args={[0.25, 0.15, 0.05]} />
               <meshStandardMaterial color={COLORS.TAPE} />
           </mesh>
       ))}
    </group>
)

const WallTicker = ({ pending, processed }: { pending: number, processed: number }) => {
    return (
        <group position={[0, 3.5, -4.9]}>
            <mesh>
                <boxGeometry args={[16, 0.5, 0.1]} />
                <meshStandardMaterial color={COLORS.TICKER_BG} />
            </mesh>
            <Text position={[0, 0, 0.06]} fontSize={0.25} color={COLORS.TICKER_TEXT} anchorX="center" anchorY="middle">
                {`PENDING: ${pending}   |   BATCH: ${processed}   |   MACULEYE V1.0`}
            </Text>
        </group>
    );
};

const AnalyticsBoard = ({ metrics }: { metrics: { efficiency: number; revenue: number; throughput: number }}) => {
    return (
        <group position={[3.5, 2.5, -4.9]}>
            {/* Monitor Frame */}
            <mesh castShadow>
                <boxGeometry args={[2.5, 1.5, 0.1]} />
                <meshStandardMaterial color="#111" />
            </mesh>
            {/* Screen */}
            <mesh position={[0, 0, 0.06]}>
                <boxGeometry args={[2.3, 1.3, 0.01]} />
                <meshStandardMaterial color="#000" />
            </mesh>
            
            {/* Content */}
            <group position={[-1.0, 0.5, 0.07]}>
                <Text color="#3498db" fontSize={0.15} anchorX="left">METRICS</Text>
                
                <Text position={[0, -0.3, 0]} color="#fff" fontSize={0.12} anchorX="left">
                    {`Throughput: ${metrics.throughput.toFixed(1)}/min`}
                </Text>
                <Text position={[0, -0.5, 0]} color={metrics.efficiency > 90 ? "#2ecc71" : "#e74c3c"} fontSize={0.12} anchorX="left">
                    {`Efficiency: ${metrics.efficiency.toFixed(2)}%`}
                </Text>
                <Text position={[0, -0.7, 0]} color="#f1c40f" fontSize={0.12} anchorX="left">
                    {`Revenue: ${metrics.revenue.toLocaleString()}`}
                </Text>
                
                {/* Visual Bars */}
                <group position={[1.4, -0.5, 0]}>
                    <mesh position={[0, 0, 0]}><planeGeometry args={[0.1, 0.6]} /><meshBasicMaterial color="#e74c3c" /></mesh>
                    <mesh position={[0.2, 0.2, 0]}><planeGeometry args={[0.1, 1.0]} /><meshBasicMaterial color="#f1c40f" /></mesh>
                    <mesh position={[0.4, 0.1, 0]}><planeGeometry args={[0.1, 0.8]} /><meshBasicMaterial color="#2ecc71" /></mesh>
                </group>
            </group>
        </group>
    )
}

const SplitBackWallWithSlot = () => {
    return (
        <group>
            {/* 1. Main Left Section */}
            <mesh position={[-3.0, 2.5, -5]} receiveShadow>
                <boxGeometry args={[12, 5, 0.2]} />
                <meshStandardMaterial color={COLORS.WALL} />
            </mesh>
            
            {/* 2. Main Right Section */}
            <mesh position={[6, 2.5, -5]} receiveShadow>
                <boxGeometry args={[6, 5, 0.2]} />
                <meshStandardMaterial color={COLORS.WALL} />
            </mesh>

            {/* 3. Middle Top (Above Slot) */}
            <mesh position={[3.0, 3.0, -5]} receiveShadow>
                <boxGeometry args={[1, 4, 0.2]} />
                <meshStandardMaterial color={COLORS.WALL} />
            </mesh>

            {/* 4. Middle Bottom (Below Slot) */}
            <mesh position={[3.0, 0.4, -5]} receiveShadow>
                <boxGeometry args={[1, 0.8, 0.2]} />
                <meshStandardMaterial color={COLORS.WALL} />
            </mesh>
        </group>
    )
}

const DoorMesh = ({ isOpen, position }: { isOpen: boolean, position: [number, number, number] }) => {
    const doorRef = useRef<Group>(null);
    useFrame((state, delta) => {
        if (doorRef.current) {
            const targetRotation = isOpen ? Math.PI / 2 : 0;
            doorRef.current.rotation.y = MathUtils.lerp(doorRef.current.rotation.y, targetRotation, delta * 3);
        }
    });

    return (
        <group position={position}>
            {/* Door Frame Top */}
            <mesh position={[0, 2.15, 0]} receiveShadow>
                 <boxGeometry args={[0.3, 0.1, 1.2]} />
                 <meshStandardMaterial color="#4a3b32" />
            </mesh>
            {/* Door Frame Sides */}
            <mesh position={[0, 1.1, -0.55]} receiveShadow>
                 <boxGeometry args={[0.3, 2.2, 0.1]} />
                 <meshStandardMaterial color="#4a3b32" />
            </mesh>
             <mesh position={[0, 1.1, 0.55]} receiveShadow>
                 <boxGeometry args={[0.3, 2.2, 0.1]} />
                 <meshStandardMaterial color="#4a3b32" />
            </mesh>

            {/* Pivot at z = -0.5 (Back edge) relative to door center */}
             <group ref={doorRef} position={[0, 0, -0.5]}> 
                 <mesh position={[0, 1.1, 0.55]} receiveShadow castShadow>
                     <boxGeometry args={[0.1, 2.2, 1.1]} />
                     <meshStandardMaterial color="#5d4037" />
                 </mesh>
                 <mesh position={[0.08, 1.1, 0.95]}>
                     <sphereGeometry args={[0.05]} />
                     <meshStandardMaterial color="#f1c40f" />
                 </mesh>
             </group>
        </group>
    );
};

const ComplexPartitionWall = ({ 
    isAssistantDoorOpen, 
    isJanitorDoorOpen 
}: { 
    isAssistantDoorOpen: boolean, 
    isJanitorDoorOpen: boolean 
}) => {
    return (
        <group>
             {/* 1. Main Side Wall Structure (x = -5) */}
             <group position={[-5.0, 0, 0]}>
                 
                 {/* Back Solid Segment (-5.0 to 0.9) */}
                 <mesh position={[0, 2.5, -2.05]} receiveShadow>
                     <boxGeometry args={[0.2, 5, 5.9]} />
                     <meshStandardMaterial color={COLORS.WALL} />
                 </mesh>

                 {/* Middle Solid Segment (2.1 to 2.9) */}
                 <mesh position={[0, 2.5, 2.5]} receiveShadow>
                     <boxGeometry args={[0.2, 5, 0.8]} />
                     <meshStandardMaterial color={COLORS.WALL} />
                 </mesh>

                 {/* Front Solid Segment (4.1 to 5.0) */}
                 <mesh position={[0, 2.5, 4.55]} receiveShadow>
                     <boxGeometry args={[0.2, 5, 0.9]} />
                     <meshStandardMaterial color={COLORS.WALL} />
                 </mesh>

                 {/* Header over Assistant Door (0.9 to 2.1) */}
                 <mesh position={[0, 3.6, 1.5]} receiveShadow>
                     <boxGeometry args={[0.2, 2.8, 1.2]} />
                     <meshStandardMaterial color={COLORS.WALL} />
                 </mesh>

                 {/* Header over Janitor Door (2.9 to 4.1) */}
                 <mesh position={[0, 3.6, 3.5]} receiveShadow>
                     <boxGeometry args={[0.2, 2.8, 1.2]} />
                     <meshStandardMaterial color={COLORS.WALL} />
                 </mesh>

                 {/* DOORS */}
                 {/* Assistant Door at z=1.5 */}
                 <DoorMesh isOpen={isAssistantDoorOpen} position={[0, 0, 1.5]} />
                 
                 {/* Janitor Door at z=3.5 */}
                 <DoorMesh isOpen={isJanitorDoorOpen} position={[0, 0, 3.5]} />
             </group>

             {/* 2. Hallway Wall (Behind Assistant) */}
             {/* Runs along X axis from -15 to -5 at z = 2.5 */}
             <mesh position={[-10.0, 2.5, 2.5]} receiveShadow>
                 <boxGeometry args={[10, 5, 0.2]} />
                 <meshStandardMaterial color={COLORS.WALL} />
             </mesh>
             
             {/* Hallway Floor Extension */}
             <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0.01, 2.5]} receiveShadow>
                 <planeGeometry args={[10, 5]} />
                 <meshStandardMaterial color="#555" />
             </mesh>
        </group>
    )
}

const Note: React.FC<{ order: Order; y: number }> = ({ order, y }) => (
    <group position={[0, y, 0.06]}>
            <mesh castShadow>
                <boxGeometry args={[0.8, 0.2, 0.01]} />
                <meshStandardMaterial color={order.status === 'COMPLETED' ? COLORS.NOTE_DONE : (order.priority === 'RUSH' ? COLORS.NOTE_RUSH : COLORS.NOTE_STANDARD)} />
            </mesh>
            <Text position={[0, 0, 0.02]} fontSize={0.08} color="#111" maxWidth={0.7} anchorX="center" anchorY="middle">
                {order.customerName.split(' ')[2] || order.customerName}
            </Text>
    </group>
);

const KanbanBoard = ({ orders }: { orders: Order[] }) => {
    const queue = useMemo(() => orders.filter(o => o.status === 'QUEUED').slice(0, 5), [orders]);
    const inbox = useMemo(() => orders.filter(o => o.status === 'ON_TABLE').slice(0, 5), [orders]);
    const doing = useMemo(() => orders.filter(o => o.status === 'PROCESSING').slice(0, 1), [orders]); // Max 1
    const done = useMemo(() => orders.filter(o => o.status === 'COMPLETED').slice(-5), [orders]); 

    return (
        <group position={[-4.88, 2.0, -2.0]} rotation={[0, Math.PI/2, 0]}>
            {/* Board Base */}
            <mesh receiveShadow>
                <boxGeometry args={[3.5, 2.5, 0.05]} />
                <meshStandardMaterial color={COLORS.KANBAN_BG} />
            </mesh>
            
            {/* Headers */}
            <group position={[0, 1.0, 0.03]}>
                 <mesh position={[-1.3, 0, 0]}><boxGeometry args={[0.8, 0.3, 0.01]} /><meshStandardMaterial color={COLORS.KANBAN_HEADER} /></mesh>
                 <Text position={[-1.3, 0, 0.02]} fontSize={0.12}>QUEUE</Text>
                 
                 <mesh position={[-0.45, 0, 0]}><boxGeometry args={[0.8, 0.3, 0.01]} /><meshStandardMaterial color={COLORS.KANBAN_HEADER} /></mesh>
                 <Text position={[-0.45, 0, 0.02]} fontSize={0.12}>INBOX</Text>

                 <mesh position={[0.45, 0, 0]}><boxGeometry args={[0.8, 0.3, 0.01]} /><meshStandardMaterial color={COLORS.KANBAN_HEADER} /></mesh>
                 <Text position={[0.45, 0, 0.02]} fontSize={0.12}>DOING</Text>

                 <mesh position={[1.3, 0, 0]}><boxGeometry args={[0.8, 0.3, 0.01]} /><meshStandardMaterial color={COLORS.KANBAN_HEADER} /></mesh>
                 <Text position={[1.3, 0, 0.02]} fontSize={0.12}>DONE</Text>
            </group>

            {/* Columns */}
            <group position={[-1.3, 0.5, 0]}>
                {queue.map((o, i) => <Note key={o.id} order={o} y={-i * 0.25} />)}
            </group>
            <group position={[-0.45, 0.5, 0]}>
                {inbox.map((o, i) => <Note key={o.id} order={o} y={-i * 0.25} />)}
            </group>
            <group position={[0.45, 0.5, 0]}>
                {doing.map((o, i) => <Note key={o.id} order={o} y={-i * 0.25} />)}
            </group>
             <group position={[1.3, 0.5, 0]}>
                {done.map((o, i) => <Note key={o.id} order={o} y={-i * 0.25} />)}
            </group>
        </group>
    )
}

const ClawArm = ({ isDropping }: { isDropping: boolean }) => {
    const armRef = useRef<Group>(null);
    const paperRef = useRef<Group>(null);

    useFrame((state, delta) => {
        if (!armRef.current || !paperRef.current) return;
        
        if (isDropping) {
             armRef.current.position.y = MathUtils.lerp(armRef.current.position.y, 1.5, delta * 2);
             paperRef.current.visible = true;
        } else {
            armRef.current.position.y = MathUtils.lerp(armRef.current.position.y, 2.5, delta * 2);
            paperRef.current.visible = false; 
        }
    });

    return (
        <group position={[LOCATIONS.CLAW_POS.x, 0, LOCATIONS.CLAW_POS.z]}>
             {/* Base on Ceiling */}
             <mesh position={[0, 3.0, 0]}>
                 <cylinderGeometry args={[0.1, 0.1, 0.5]} />
                 <meshStandardMaterial color="#555" />
             </mesh>
             
             <group ref={armRef} position={[0, 2.5, 0]}>
                 <mesh position={[0, 0.5, 0]}>
                     <cylinderGeometry args={[0.05, 0.05, 1.5]} />
                     <meshStandardMaterial color={COLORS.CLAW_ARM} />
                 </mesh>
                 <group position={[0, -0.3, 0]}>
                     <mesh position={[0.1, 0, 0]} rotation={[0,0,-0.5]}>
                         <boxGeometry args={[0.05, 0.3, 0.05]} />
                         <meshStandardMaterial color="silver" />
                     </mesh>
                      <mesh position={[-0.1, 0, 0]} rotation={[0,0,0.5]}>
                         <boxGeometry args={[0.05, 0.3, 0.05]} />
                         <meshStandardMaterial color="silver" />
                     </mesh>
                 </group>
                 <group ref={paperRef} position={[0, -0.4, 0]} visible={false}>
                      <mesh rotation={[0, 0, Math.PI/2]}>
                          <boxGeometry args={[0.4, 0.02, 0.5]} />
                          <meshStandardMaterial color={COLORS.PAPER} />
                      </mesh>
                 </group>
             </group>
        </group>
    )
}

const DropZonePapers = ({ count }: { count: number }) => {
    // Memoize the random positions and rotations so they don't change on every render
    const papers = useMemo(() => {
        return Array.from({ length: 50 }).map(() => ({
            pos: [(Math.random()-0.5)*0.3, 0, (Math.random()-0.5)*0.3] as [number, number, number],
            rot: [0, Math.random() * Math.PI, 0] as [number, number, number]
        }));
    }, []);

    return (
        <group position={[0, 0.7, 0]}>
            {papers.slice(0, Math.min(count, 50)).map((p, i) => (
                <group key={i} position={[p.pos[0], i * 0.03, p.pos[2]]}>
                    <mesh rotation={p.rot}>
                         <boxGeometry args={[0.4, 0.02, 0.5]} />
                         <meshStandardMaterial color={COLORS.PAPER} />
                    </mesh>
                </group>
            ))}
        </group>
    );
};

const AssistantStation = ({ isDropping, assistantState, droppedCount = 0 }: { isDropping: boolean, assistantState: WorkerState, droppedCount?: number }) => {
    return (
        <group>
            {/* New Dropzone Table */}
             <group position={[LOCATIONS.DROPZONE_TABLE.x, 0, LOCATIONS.DROPZONE_TABLE.z]}>
                 <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
                     <boxGeometry args={[1.0, 0.1, 1.0]} />
                     <meshStandardMaterial color={COLORS.DESK} />
                 </mesh>
                 <mesh position={[-0.45, 0.3, 0.45]}><boxGeometry args={[0.08, 0.6, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                 <mesh position={[0.45, 0.3, 0.45]}><boxGeometry args={[0.08, 0.6, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                 <mesh position={[-0.45, 0.3, -0.45]}><boxGeometry args={[0.08, 0.6, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                 <mesh position={[0.45, 0.3, -0.45]}><boxGeometry args={[0.08, 0.6, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                 
                 {droppedCount > 0 && <DropZonePapers count={droppedCount} />}
             </group>

             <ClawArm isDropping={isDropping} />

            {/* Assistant Desk */}
            <group position={[LOCATIONS.ASSISTANT_DESK.x, 0, LOCATIONS.ASSISTANT_DESK.z]}>
                <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
                     <boxGeometry args={[1.5, 0.1, 0.8]} />
                     <meshStandardMaterial color={COLORS.DESK} />
                </mesh>
                <mesh position={[-0.7, 0.35, 0.35]}><boxGeometry args={[0.08, 0.7, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                <mesh position={[0.7, 0.35, 0.35]}><boxGeometry args={[0.08, 0.7, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                <mesh position={[-0.7, 0.35, -0.35]}><boxGeometry args={[0.08, 0.7, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                <mesh position={[0.7, 0.35, -0.35]}><boxGeometry args={[0.08, 0.7, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
                
                {/* One Laptop */}
                <Laptop workerState={assistantState} />
            </group>

            {/* Chair behind desk */}
             <Chair 
                isSitting={assistantState === WorkerState.ASSISTANT_SITTING} 
                position={[LOCATIONS.ASSISTANT_SEAT.x, 0, LOCATIONS.ASSISTANT_SEAT.z]} 
                rotation={[0, Math.PI, 0]}
             />
             
        </group>
    )
}

const PaperConveyorAnimation = () => {
    const groupRef = useRef<Group>(null);

    useFrame((state, delta) => {
        if (groupRef.current) {
            groupRef.current.position.z -= delta * 3;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0.92, 0]}>
             <mesh rotation={[0, Math.random() * 0.2, 0]}>
                <boxGeometry args={[0.4, 0.02, 0.5]} />
                <meshStandardMaterial color={COLORS.PAPER} />
             </mesh>
        </group>
    );
};

export const OfficeScene: React.FC<OfficeSceneProps> = ({ 
    paperCount, 
    processedCount, 
    workerState,
    assistantState,
    isJanitorDoorOpen = false,
    isAssistantDoorOpen = false,
    orders,
    isClawDropping = false,
    droppedCount = 0,
    metrics
}) => {
  const isDepositing = workerState === WorkerState.DEPOSITING;
  const isWorking = workerState === WorkerState.WORKING;

  const isMainWorkerSitting = [
      WorkerState.WORKING, 
      WorkerState.IDLE, 
      WorkerState.GAMING, 
      WorkerState.SLEEPING,
      WorkerState.INSERTING_TAPE,
      WorkerState.SITTING_DOWN 
  ].includes(workerState);

  return (
    <group>
      {/* CORPORATE FLOOR - Green Carpet */}
      <CarpetFloor />

      {/* WALLS */}
      <SplitBackWallWithSlot />
      <ComplexPartitionWall 
        isAssistantDoorOpen={isAssistantDoorOpen} 
        isJanitorDoorOpen={isJanitorDoorOpen} 
      />
      
      {/* KANBAN BOARD */}
      <KanbanBoard orders={orders} />

      {/* WINDOW ON WALL */}
      <group position={[-3.5, 2, -4.85]}>
          <mesh>
              <planeGeometry args={[2.5, 2]} />
              <meshBasicMaterial color="#87CEEB" /> 
          </mesh>
          <mesh position={[0, 1.05, 0.05]}><boxGeometry args={[2.7, 0.1, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0, -1.05, 0.05]}><boxGeometry args={[2.7, 0.1, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[1.3, 0, 0.05]}><boxGeometry args={[0.1, 2.2, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[-1.3, 0, 0.05]}><boxGeometry args={[0.1, 2.2, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
      </group>

      <Whiteboard />
      <TapeArchive count={processedCount} />
      <WallTicker pending={paperCount} processed={processedCount} />
      <AnalyticsBoard metrics={metrics} />

      {/* ASSISTANT STATION */}
      <AssistantStation isDropping={isClawDropping} assistantState={assistantState} droppedCount={droppedCount} />

      {/* DESK GROUP */}
      <group position={[0, 0, 1.5]}>
        <mesh position={[0, 0.7, 0]} receiveShadow castShadow>
          <boxGeometry args={[2.5, 0.1, 1.2]} />
          <meshStandardMaterial color={COLORS.DESK} />
        </mesh>
        <mesh position={[-1.1, 0.35, 0.5]} castShadow><boxGeometry args={[0.1, 0.7, 0.1]} /><meshStandardMaterial color="#3e2723" /></mesh>
        <mesh position={[1.1, 0.35, 0.5]} castShadow><boxGeometry args={[0.1, 0.7, 0.1]} /><meshStandardMaterial color="#3e2723" /></mesh>
        <mesh position={[-1.1, 0.35, -0.5]} castShadow><boxGeometry args={[0.1, 0.7, 0.1]} /><meshStandardMaterial color="#3e2723" /></mesh>
        <mesh position={[1.1, 0.35, -0.5]} castShadow><boxGeometry args={[0.1, 0.7, 0.1]} /><meshStandardMaterial color="#3e2723" /></mesh>

        <Laptop workerState={workerState} />
        <TapePlayer isPlaying={isWorking} />
        <GameController />
      </group>

      <Chair isSitting={isMainWorkerSitting} />
      
      {/* PLANTS */}
      <Plant position={[LOCATIONS.PLANT_L_TARGET.x, 0, LOCATIONS.PLANT_L_TARGET.z - 1.0]} />
      <Plant position={[LOCATIONS.PLANT_R_TARGET.x, 0, LOCATIONS.PLANT_R_TARGET.z - 1.0]} />

      {/* INTAKE TABLE */}
      <group position={[LOCATIONS.INTAKE.x, 0, LOCATIONS.INTAKE.z - 1.5]}> 
         <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
            <boxGeometry args={[1.5, 1, 1.5]} />
            <meshStandardMaterial color={COLORS.DESK} />
         </mesh>
         <Text position={[0, 1.5, 0]} color="white" fontSize={0.25} anchorX="center" anchorY="bottom" outlineWidth={0.02} outlineColor="#000">
            INBOX
         </Text>
         {paperCount > 0 && Array.from({ length: Math.min(paperCount, 10) }).map((_, i) => (
             <group key={i} position={[0, 1.01 + (i * 0.05), 0]}>
                 {/* Paper */}
                 <mesh position={[0.2, 0, 0]} rotation={[0, Math.random() * 0.2, 0]} castShadow>
                     <boxGeometry args={[0.4, 0.02, 0.5]} />
                     <meshStandardMaterial color={COLORS.PAPER} />
                 </mesh>
                 {/* Tape Stack */}
                 <mesh position={[-0.3, 0, 0]} rotation={[0, Math.random() * 0.1, 0]} castShadow>
                     <boxGeometry args={[0.25, 0.04, 0.15]} />
                     <meshStandardMaterial color={COLORS.TAPE} />
                 </mesh>
             </group>
         ))}
      </group>

      {/* OUTBOX STATION */}
      <group position={[LOCATIONS.OUTPUT.x, 0, LOCATIONS.OUTPUT.z - 0.75]}>
         {/* Table Stand */}
         <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
             <boxGeometry args={[1.2, 0.8, 1.2]} />
             <meshStandardMaterial color="#7f8c8d" />
         </mesh>

         {/* Conveyor Belt Unit */}
         <group position={[0, 0.85, -0.5]} rotation={[0, 0, 0]}>
             <mesh receiveShadow castShadow>
                 <boxGeometry args={[0.8, 0.1, 2.5]} />
                 <meshStandardMaterial color={COLORS.CONVEYOR} />
             </mesh>
             {/* Rails */}
             <mesh position={[0.45, 0.05, 0]}>
                 <boxGeometry args={[0.1, 0.1, 2.5]} />
                 <meshStandardMaterial color="#95a5a6" />
             </mesh>
             <mesh position={[-0.45, 0.05, 0]}>
                 <boxGeometry args={[0.1, 0.1, 2.5]} />
                 <meshStandardMaterial color="#95a5a6" />
             </mesh>
         </group>

         {/* The Dispatch Box on the conveyor */}
         <group position={[0, 0.9, 0]}>
             <mesh castShadow>
                <boxGeometry args={[0.6, 0.15, 0.6]} />
                <meshStandardMaterial color={COLORS.BIN} />
             </mesh>
             <mesh position={[0, 0.08, 0]} rotation={[-Math.PI/2, 0, 0]}>
                 <planeGeometry args={[0.55, 0.55]} />
                 <meshStandardMaterial color="#111" />
             </mesh>
         </group>

         <Text position={[0, 2.0, 0]} color="white" fontSize={0.25} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000">
            DISPATCH
         </Text>

         {isDepositing && (
             <PaperConveyorAnimation />
         )}
      </group>

    </group>
  );
};