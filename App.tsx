import React, { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, MathUtils } from 'three';
import { VoxelCharacter } from './components/VoxelCharacter';
import { OfficeScene } from './components/OfficeScene';
import { WorkerState, LOCATIONS, Order, PriorityLevel, MAX_RACK_CAPACITY } from './types';

// --- HELPERS ---

const COMPUTE_PRICE_USD = 0.00001;
const COST_PER_MINUTE_USD = 0.006;
const MARKUP = 5;

const calculatePrice = (durationMinutes: number, priority: PriorityLevel) => {
    // Base Calculation: Cost * Markup
    let basePrice = durationMinutes * COST_PER_MINUTE_USD * MARKUP;
    
    // Rush Multiplier (2x for priority service)
    if (priority === 'RUSH') {
        basePrice *= 2; 
    }
    
    // Safety for 0 duration (default to 1 min cost)
    if (basePrice === 0) basePrice = COST_PER_MINUTE_USD * MARKUP * (priority === 'RUSH' ? 2 : 1);

    return Math.floor(basePrice / COMPUTE_PRICE_USD);
}

const generateRandomOrder = (prio: PriorityLevel = 'STANDARD'): Order => {
    const randomDuration = 2 + Math.random() * 8; // Random 2-10 mins
    return {
        id: Math.random().toString(36).substr(2, 9),
        customerName: "Auto User " + Math.floor(Math.random() * 100),
        fileName: "batch_job_" + Math.floor(Math.random() * 1000) + ".mp3",
        price: calculatePrice(randomDuration, prio),
        status: 'QUEUED',
        priority: prio,
        timestamp: Date.now() - Math.floor(Math.random() * 100000)
    };
};

const transcribeAudio = async (base64Data: string, mimeType: string): Promise<string> => {
    try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileData: base64Data, mimeType }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.transcript || "Transcription failed.";
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Transcription error:", msg);
        return `Transcription failed: ${msg}`;
    }
};

const calculatePath = (start: Vector3, end: Vector3): Vector3[] => {
    const path: Vector3[] = [];
    
    // Safety check for direct simple moves
    if (start.distanceTo(end) < 1.0) {
        path.push(end.clone());
        return path;
    }

    // "Highway" Logic
    // We force all lateral movement to occur on the safe Z=0.5 corridor.
    // This corridor is safe because:
    // - Dispatch Unit (X=3) starts at Z=-2.0 (Back)
    // - Intake Table (X=-3) ends at Z=-0.25 (Back)
    // - Main Desk (X=0) starts at Z=0.9 (Front)
    // Therefore, Z=0.5 is a clear lane across the entire room width.
    
    const SAFE_CORRIDOR_Z = LOCATIONS.HALLWAY_FRONT_Z; // 0.5

    // 1. Move Z to SAFE_CORRIDOR (if not already close)
    if (Math.abs(start.z - SAFE_CORRIDOR_Z) > 0.1) {
        path.push(new Vector3(start.x, 0, SAFE_CORRIDOR_Z));
    }

    // 2. Move X along SAFE_CORRIDOR to target X
    // We push this point even if X is close, to ensure we turn properly if needed,
    // but avoiding small jitters if X is identical is good.
    if (Math.abs(start.x - end.x) > 0.1) {
        path.push(new Vector3(end.x, 0, SAFE_CORRIDOR_Z));
    }

    // 3. Move Z from SAFE_CORRIDOR to target Z
    path.push(end.clone());
    
    return path;
};

const moveTowards = (
    current: Vector3,
    target: Vector3,
    rotationRef: React.MutableRefObject<number>,
    speed: number,
    rotSpeed: number
): boolean => {
    const dist = current.distanceTo(target);
    if (dist < 0.1) {
        current.copy(target);
        return true;
    }

    const direction = new Vector3().subVectors(target, current).normalize();
    const targetRotation = Math.atan2(direction.x, direction.z);
    
    // Smooth rotation
    let rotDiff = targetRotation - rotationRef.current;
    // Normalize angle to -PI to PI
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    
    rotationRef.current += rotDiff * Math.min(1, rotSpeed);
    
    // Move
    current.add(direction.multiplyScalar(speed));
    
    return false;
};

// --- COMPONENTS ---

const JanitorNPC = ({ 
    tapesInRack, 
    setTapesInRack,
    onDoorStateChange 
}: { 
    tapesInRack: number, 
    setTapesInRack: (n: number) => void,
    onDoorStateChange: (isOpen: boolean) => void 
}) => {
    const [state, setState] = useState<'IDLE' | 'WALKING_TO_ENTRY' | 'WALKING_TO_PATH' | 'WALKING_TO_RACK' | 'COLLECTING' | 'RETURNING_TO_PATH' | 'RETURNING_TO_ENTRY' | 'LEAVING'>('IDLE');
    const position = useRef(new Vector3().copy(LOCATIONS.JANITOR_SPAWN));
    const rotation = useRef(Math.PI / 2);
    const collectTimer = useRef(0);

    useEffect(() => {
        if (tapesInRack >= MAX_RACK_CAPACITY && state === 'IDLE') {
            setState('WALKING_TO_ENTRY');
        }
    }, [tapesInRack, state]);

    useEffect(() => {
         // Door should be open when walking to/from entry
         const interactingWithDoor = state === 'WALKING_TO_ENTRY' || state === 'LEAVING';
         onDoorStateChange(interactingWithDoor);
    }, [state, onDoorStateChange]);

    useFrame((_, delta) => {
        const speed = 2.0 * delta; 
        const rotSpeed = 8 * delta;

        switch (state) {
            case 'IDLE':
                break;
            case 'WALKING_TO_ENTRY':
                if (moveTowards(position.current, LOCATIONS.DELIVERY_ENTRY, rotation, speed, rotSpeed)) {
                    setState('WALKING_TO_PATH');
                }
                break;
            case 'WALKING_TO_PATH':
                // Walk to side to avoid desk
                 if (moveTowards(position.current, LOCATIONS.WALKWAY_POINT, rotation, speed, rotSpeed)) {
                    setState('WALKING_TO_RACK');
                }
                break;
            case 'WALKING_TO_RACK':
                if (moveTowards(position.current, LOCATIONS.JANITOR_RACK_POS, rotation, speed, rotSpeed)) {
                    setState('COLLECTING');
                    collectTimer.current = 2.0;
                }
                break;
            case 'COLLECTING':
                collectTimer.current -= delta;
                if (collectTimer.current <= 0) {
                    setTapesInRack(0);
                    setState('RETURNING_TO_PATH');
                }
                break;
            case 'RETURNING_TO_PATH':
                 if (moveTowards(position.current, LOCATIONS.WALKWAY_POINT, rotation, speed, rotSpeed)) {
                    setState('RETURNING_TO_ENTRY');
                }
                break;
            case 'RETURNING_TO_ENTRY':
                if (moveTowards(position.current, LOCATIONS.DELIVERY_ENTRY, rotation, speed, rotSpeed)) {
                    setState('LEAVING');
                }
                break;
            case 'LEAVING':
                if (moveTowards(position.current, LOCATIONS.JANITOR_SPAWN, rotation, speed, rotSpeed)) {
                    setState('IDLE');
                }
                break;
        }
    });

    if (state === 'IDLE') return null;

    const isFull = state === 'RETURNING_TO_PATH' || state === 'RETURNING_TO_ENTRY' || state === 'LEAVING';

    return (
        <VoxelCharacter 
            position={position.current} 
            rotation={rotation} 
            state={WorkerState.WALKING_TO_DESK} // Reuse walking anim
            hasPaper={false} 
            showHeadphones={false}
            variant="janitor"
            isJanitorFull={isFull}
        />
    )
}

const AssistantNPC = ({ 
  droppedIds,
  onPickupFromTable,
  onDeliver,
  onStateChange,
  onDoorStateChange
}: { 
  droppedIds: string[],
  onPickupFromTable: (ids: string[]) => void,
  onDeliver: (deliveredIds: string[]) => void,
  onStateChange: (state: WorkerState) => void,
  onDoorStateChange: (isOpen: boolean) => void
}) => {
  const [state, setState] = useState<WorkerState>(WorkerState.ASSISTANT_SITTING);
  const position = useRef(new Vector3().copy(LOCATIONS.ASSISTANT_SEAT));
  const rotation = useRef(Math.PI); 
  const idsToDeliver = useRef<string[]>([]);
  const timer = useRef(0);

  useEffect(() => {
      onStateChange(state);
      
      const isWalkingThroughDoor = state === WorkerState.ASSISTANT_WALKING_TO_INBOX || 
                                   state === WorkerState.ASSISTANT_WALKING_TO_DOOR_NODE ||
                                   state === WorkerState.ASSISTANT_DROPPING || 
                                   state === WorkerState.ASSISTANT_WALKING_OUT_DOOR ||
                                   state === WorkerState.ASSISTANT_WALKING_HOME;
      onDoorStateChange(isWalkingThroughDoor);
  }, [state, onStateChange, onDoorStateChange]);

  useFrame((_, delta) => {
    const speed = 2.5 * delta; 
    const rotSpeed = 8 * delta;

    switch (state) {
        case WorkerState.ASSISTANT_SITTING:
            // Only move if items are PHYSICALLY on the table (droppedIds > 0)
            if (droppedIds.length > 0) {
                // We don't take them yet, we walk to them
                setState(WorkerState.ASSISTANT_WALKING_TO_DROPZONE);
            } else {
                position.current.copy(LOCATIONS.ASSISTANT_SEAT);
                if (Math.abs(rotation.current - Math.PI) > 0.1) rotation.current = Math.PI; 
            }
            break;

        case WorkerState.ASSISTANT_WALKING_TO_DROPZONE:
            if (moveTowards(position.current, LOCATIONS.DROPZONE_WAIT_POS, rotation, speed, rotSpeed)) {
                // Look at table
                rotation.current = 0; 
                setState(WorkerState.ASSISTANT_PICKING_UP);
                timer.current = 0.5;
            }
            break;
            
        case WorkerState.ASSISTANT_PICKING_UP:
             timer.current -= delta;
             if (timer.current <= 0) {
                 // "Pick up" all currently dropped items
                 if (droppedIds.length > 0) {
                     idsToDeliver.current = [...droppedIds];
                     onPickupFromTable(droppedIds); // Clear table
                 }
                 setState(WorkerState.ASSISTANT_WALKING_TO_DOOR_NODE);
             }
             break;

        case WorkerState.ASSISTANT_WALKING_TO_DOOR_NODE:
            // Walk to the point aligned with the door (Outside)
             if (moveTowards(position.current, LOCATIONS.ASSISTANT_PATH_NODE, rotation, speed, rotSpeed)) {
                setState(WorkerState.ASSISTANT_WALKING_TO_INBOX);
            }
            break;

        case WorkerState.ASSISTANT_WALKING_TO_INBOX:
             // Now walk straight through door to inbox
            if (moveTowards(position.current, LOCATIONS.ASSISTANT_INBOX_TARGET, rotation, speed, rotSpeed)) {
                setState(WorkerState.ASSISTANT_DROPPING);
                timer.current = 0.5;
            }
            break;

        case WorkerState.ASSISTANT_DROPPING:
            timer.current -= delta;
            if (timer.current <= 0) {
                onDeliver(idsToDeliver.current);
                idsToDeliver.current = [];
                setState(WorkerState.ASSISTANT_WALKING_OUT_DOOR);
            }
            break;
            
        case WorkerState.ASSISTANT_WALKING_OUT_DOOR:
             // Walk back out to the node aligned with door
             if (moveTowards(position.current, LOCATIONS.ASSISTANT_PATH_NODE, rotation, speed, rotSpeed)) {
                setState(WorkerState.ASSISTANT_WALKING_HOME);
            }
            break;

        case WorkerState.ASSISTANT_WALKING_HOME:
            if (moveTowards(position.current, LOCATIONS.ASSISTANT_SEAT, rotation, speed, rotSpeed)) {
                setState(WorkerState.ASSISTANT_SITTING);
            }
            break;
    }
  });

  const hasPaper = state === WorkerState.ASSISTANT_WALKING_TO_DOOR_NODE || 
                   state === WorkerState.ASSISTANT_WALKING_TO_INBOX || 
                   state === WorkerState.ASSISTANT_DROPPING ||
                   state === WorkerState.ASSISTANT_WALKING_OUT_DOOR;

  return (
      <VoxelCharacter 
        position={position.current} 
        rotation={rotation} 
        state={state} 
        hasPaper={hasPaper} 
        showHeadphones={false}
        variant="female"
      />
  )
}

const SimulationLogic = ({ 
  papersInStack, 
  papersProcessed,
  setPapersInStack, 
  setPapersProcessed,
  onPickup,
  onComplete,
  orders,
  onDeliveryArrived
}: { 
  papersInStack: number, 
  papersProcessed: number,
  setPapersInStack: React.Dispatch<React.SetStateAction<number>>,
  setPapersProcessed: React.Dispatch<React.SetStateAction<number>>,
  onPickup: () => void,
  onComplete: () => void,
  orders: Order[],
  onDeliveryArrived: (ids: string[]) => void
}) => {
  const [workerState, setWorkerState] = useState<WorkerState>(WorkerState.IDLE);
  const [assistantState, setAssistantState] = useState<WorkerState>(WorkerState.ASSISTANT_SITTING);
  const [hasPaper, setHasPaper] = useState(false);
  const [isJanitorDoorOpen, setIsJanitorDoorOpen] = useState(false);
  const [isAssistantDoorOpen, setIsAssistantDoorOpen] = useState(false);
  
  // Claw & Drop Logic
  const [isClawDropping, setIsClawDropping] = useState(false);
  const [droppedIds, setDroppedIds] = useState<string[]>([]); // Items physically on the drop table
  const clawQueue = useRef<string[]>([]); // Items waiting to be dropped by claw
  const clawTimer = useRef(0);
  
  const [tapesInRack, setTapesInRack] = useState(0);

  // Metrics State
  const [metrics, setMetrics] = useState({ efficiency: 93.33, revenue: 0, throughput: 0 });

  const position = useRef(new Vector3().copy(LOCATIONS.DESK_SEAT));
  const rotation = useRef(0);
  const pathQueue = useRef<Vector3[]>([]);
  
  const workTimer = useRef(0);
  const actionTimer = useRef(0);
  const idleDecisionTimer = useRef(1.0);
  const depositTimer = useRef(0);
  const nextInterruptCheck = useRef(0);
  const startTime = useRef(Date.now());

  // Pathing helper wrapper
  const setDestination = (target: Vector3, nextState: WorkerState) => {
      pathQueue.current = calculatePath(position.current, target);
      setWorkerState(nextState);
  };
  
  // 1. Detect New Orders -> Add to Claw Queue
  const processedOrderIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
      orders.forEach(o => {
          if (o.status === 'QUEUED' && !processedOrderIds.current.has(o.id)) {
              processedOrderIds.current.add(o.id);
              clawQueue.current.push(o.id);
          }
      });
  }, [orders]);

  // 2. Claw Animation Loop
  useFrame((state, delta) => {
      // If Claw is idle and there are items to drop
      if (!isClawDropping && clawQueue.current.length > 0) {
          setIsClawDropping(true);
          clawTimer.current = 1.0; // Drop duration
      }

      if (isClawDropping) {
          clawTimer.current -= delta;
          if (clawTimer.current <= 0) {
              // Drop complete
              const id = clawQueue.current.shift();
              if (id) {
                  setDroppedIds(prev => [...prev, id]);
              }
              setIsClawDropping(false);
          }
      }
  });

  // Metrics Update Loop
  useFrame((state) => {
     // Efficiency Fluctuation
     const time = state.clock.getElapsedTime();
     const baseEff = 93.33;
     const variance = Math.sin(time * 0.5) * 2.5 + Math.cos(time * 2.0) * 0.5;
     
     // Revenue Sum
     const revenue = orders.filter(o => o.status === 'COMPLETED').reduce((acc, curr) => acc + curr.price, 0);
     
     // Throughput (Papers / Minute)
     const minutesElapsed = (Date.now() - startTime.current) / 60000;
     const throughput = minutesElapsed > 0 ? (papersProcessed / minutesElapsed) : 0;

     setMetrics({
         efficiency: baseEff + variance,
         revenue: revenue,
         throughput: throughput
     });
  });

  useFrame((state, delta) => {
    const moveSpeed = 2.5 * delta; 
    const rotateSpeed = 8 * delta;

    // Movement Loop: Consume Path Queue
    if (pathQueue.current.length > 0) {
        const target = pathQueue.current[0];
        const arrived = moveTowards(position.current, target, rotation, moveSpeed, rotateSpeed);
        if (arrived) {
            pathQueue.current.shift();
        }
        if (pathQueue.current.length > 0) return;
    }

    // Logic State Machine (Only runs when not moving)
    
    // HIGH PRIORITY INTERRUPT: Work available
    // But we check nicely now. We don't interrupt watering or active tasks, only idle states.
    if (papersInStack > 0 && !hasPaper && pathQueue.current.length === 0) {
        if (workerState === WorkerState.IDLE || workerState === WorkerState.SLEEPING || workerState === WorkerState.GAMING) {
             nextInterruptCheck.current -= delta;
             if (nextInterruptCheck.current <= 0) {
                 const laziness = Math.random();
                 // 30% chance to work immediately, 70% chance to ignore for a bit longer
                 if (laziness < 0.3) { 
                    setDestination(LOCATIONS.STAND_POS, WorkerState.STANDING_UP);
                    return; 
                 } else {
                    // Ignore work for 2-4 seconds
                    nextInterruptCheck.current = 2.0 + Math.random() * 2.0;
                 }
             }
        }
    }

    switch (workerState) {
      case WorkerState.IDLE:
        idleDecisionTimer.current -= delta;
        if (idleDecisionTimer.current <= 0) {
            const rand = Math.random();
            // 0.0 - 0.2: Sleep
            // 0.2 - 0.4: Game
            // 0.4 - 0.7: Water Plants (Increased chance)
            // 0.7 - 1.0: Work or Chill
            
            if (rand < 0.2) {
                setWorkerState(WorkerState.SLEEPING);
                actionTimer.current = 5 + Math.random() * 5;
            } else if (rand < 0.4) {
                setWorkerState(WorkerState.GAMING);
                actionTimer.current = 5 + Math.random() * 5;
            } else if (rand < 0.7) {
                 setDestination(LOCATIONS.PLANT_L_TARGET, WorkerState.WALKING_TO_PLANT_L);
            } else {
                // If papers exist, maybe work?
                if (papersInStack > 0) {
                     setDestination(LOCATIONS.STAND_POS, WorkerState.STANDING_UP);
                } else {
                     // Just sit there
                     idleDecisionTimer.current = 2.0;
                }
            }
        }
        break;

      case WorkerState.SLEEPING:
      case WorkerState.GAMING:
        actionTimer.current -= delta;
        if (actionTimer.current <= 0) {
            setWorkerState(WorkerState.IDLE);
            idleDecisionTimer.current = 2.0;
            // Ensure they don't immediately work after waking up
            nextInterruptCheck.current = 2.0; 
        }
        break;

      // WATERING LOGIC
      case WorkerState.WALKING_TO_PLANT_L:
          setWorkerState(WorkerState.WATERING_L);
          actionTimer.current = 3.0; // Watering takes a bit
          break;
      case WorkerState.WATERING_L:
          actionTimer.current -= delta;
          if (actionTimer.current <= 0) {
              setDestination(LOCATIONS.PLANT_R_TARGET, WorkerState.WALKING_TO_PLANT_R);
          }
          break;
      case WorkerState.WALKING_TO_PLANT_R:
          setWorkerState(WorkerState.WATERING_R);
          actionTimer.current = 3.0; // Watering takes a bit
          break;
      case WorkerState.WATERING_R:
          actionTimer.current -= delta;
          if (actionTimer.current <= 0) {
              setDestination(LOCATIONS.STAND_POS, WorkerState.RETURNING_FROM_PLANTS);
          }
          break;
      case WorkerState.RETURNING_FROM_PLANTS:
          setDestination(LOCATIONS.DESK_SEAT, WorkerState.SITTING_DOWN);
          break;

      // WORK LOGIC
      case WorkerState.STANDING_UP:
         if (hasPaper) {
             setDestination(LOCATIONS.OUTPUT, WorkerState.WALKING_TO_OUTPUT);
         } else if (papersInStack > 0) {
             setDestination(LOCATIONS.INTAKE, WorkerState.WALKING_TO_INTAKE);
         } else {
             setDestination(LOCATIONS.PLANT_L_TARGET, WorkerState.WALKING_TO_PLANT_L);
         }
         break;

      case WorkerState.WALKING_TO_INTAKE:
         setWorkerState(WorkerState.PICKING_UP);
         break;

      case WorkerState.PICKING_UP:
        if (papersInStack > 0) {
           setPapersInStack(prev => Math.max(0, prev - 1));
           setHasPaper(true);
           onPickup();
           setDestination(LOCATIONS.STAND_POS, WorkerState.WALKING_TO_DESK);
        } else {
           setDestination(LOCATIONS.STAND_POS, WorkerState.WALKING_TO_DESK);
        }
        break;

      case WorkerState.WALKING_TO_DESK:
        setDestination(LOCATIONS.DESK_SEAT, WorkerState.SITTING_DOWN);
        break;

      case WorkerState.SITTING_DOWN:
        position.current.copy(LOCATIONS.DESK_SEAT);
        rotation.current = 0;
        if (hasPaper) {
            setWorkerState(WorkerState.INSERTING_TAPE);
            actionTimer.current = 1.5; 
        } else {
            setWorkerState(WorkerState.IDLE);
            idleDecisionTimer.current = 1.0;
        }
        break;

      case WorkerState.INSERTING_TAPE:
         actionTimer.current -= delta;
         if (actionTimer.current <= 0) {
             setWorkerState(WorkerState.WORKING);
             workTimer.current = 2.5;
         }
         break;

      case WorkerState.WORKING:
        if (!hasPaper && papersInStack === 0) {
             setWorkerState(WorkerState.IDLE);
             return;
        }
        workTimer.current -= delta;
        if (workTimer.current <= 0) {
            setDestination(LOCATIONS.STAND_POS, WorkerState.STANDING_UP);
        }
        break;

      case WorkerState.WALKING_TO_OUTPUT:
          setWorkerState(WorkerState.DEPOSITING);
          depositTimer.current = 0.8; 
          break;

      case WorkerState.DEPOSITING:
          depositTimer.current -= delta;
          if (depositTimer.current <= 0) {
              setDestination(LOCATIONS.ARCHIVE_TARGET, WorkerState.WALKING_TO_ARCHIVE);
          }
          break;

      case WorkerState.WALKING_TO_ARCHIVE:
          setWorkerState(WorkerState.ARCHIVING_TAPE);
          actionTimer.current = 1.0;
          break;

      case WorkerState.ARCHIVING_TAPE:
          actionTimer.current -= delta;
          if (actionTimer.current <= 0) {
              setHasPaper(false);
              setPapersProcessed(prev => prev + 1);
              setTapesInRack(prev => prev + 1);
              onComplete();
              
              // 20% chance to take a break even if work exists
              const takeBreak = Math.random() < 0.2;

              if (papersInStack > 0 && !takeBreak) {
                  setDestination(LOCATIONS.INTAKE, WorkerState.WALKING_TO_INTAKE);
              } else {
                  setDestination(LOCATIONS.STAND_POS, WorkerState.WALKING_TO_DESK);
              }
          }
          break;
    }
  });

  return (
    <>
      <VoxelCharacter 
        position={position.current} 
        rotation={rotation} 
        state={workerState}
        hasPaper={hasPaper}
        showHeadphones={true} 
      />

      <AssistantNPC 
        droppedIds={droppedIds}
        onPickupFromTable={(ids) => setDroppedIds(prev => prev.filter(p => !ids.includes(p)))}
        onDeliver={onDeliveryArrived}
        onStateChange={setAssistantState}
        onDoorStateChange={setIsAssistantDoorOpen}
      />
      
      <JanitorNPC 
        tapesInRack={tapesInRack}
        setTapesInRack={setTapesInRack}
        onDoorStateChange={setIsJanitorDoorOpen}
      />
      
      {workerState === WorkerState.WORKING && hasPaper && (
          <mesh position={LOCATIONS.DESK_WORK_POS} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[0.3, 0.4]} />
              <meshStandardMaterial color="white" />
          </mesh>
      )}

      <OfficeScene 
        paperCount={papersInStack} 
        processedCount={tapesInRack} 
        workerState={workerState} 
        assistantState={assistantState}
        isJanitorDoorOpen={isJanitorDoorOpen}
        isAssistantDoorOpen={isAssistantDoorOpen}
        orders={orders}
        isClawDropping={isClawDropping}
        metrics={metrics}
        droppedCount={droppedIds.length}
      />
    </>
  );
};

const App: React.FC = () => {
  const [papersInStack, setPapersInStack] = useState(0); 
  const [papersProcessed, setPapersProcessed] = useState(0);
  
  // Order System State
  const [orders, setOrders] = useState<Order[]>([]);
  const [uiView, setUiView] = useState<'LANDING' | 'JOB_SELECT' | 'FORM' | 'STATUS' | 'ABOUT' | 'TEAM'>('LANDING');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<string | undefined>(undefined);
  const [mimeType, setMimeType] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<PriorityLevel>('STANDARD');
  const [isPaying, setIsPaying] = useState(false);
  const [duration, setDuration] = useState(0);

  // Initial Seed
  useEffect(() => {
     const initOrders: Order[] = Array.from({length: 4}).map(() => generateRandomOrder('STANDARD'));
     setOrders(initOrders);
  }, []);

  // Background Simulation of other orders
  useEffect(() => {
    const interval = setInterval(() => {
        // randomly add an order every 5-15s
        if (Math.random() > 0.5) {
            const newOrder = generateRandomOrder();
            setOrders(prev => {
                const list = [...prev, newOrder];
                // Sort by Priority (RUSH first) then Timestamp
                return list.sort((a, b) => {
                    if (a.priority === b.priority) return a.timestamp - b.timestamp;
                    return a.priority === 'RUSH' ? -1 : 1;
                });
            });
        }
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setFileName(file.name);
          setMimeType(file.type);
          
          const reader = new FileReader();
          reader.onload = (event) => {
              if (event.target && typeof event.target.result === 'string') {
                  const base64Data = event.target.result.split(',')[1];
                  setFileData(base64Data);
              }
          };
          reader.readAsDataURL(file);
          
          // Attempt to get audio duration
          const audio = new Audio(URL.createObjectURL(file));
          audio.onloadedmetadata = () => {
              if (audio.duration && isFinite(audio.duration)) {
                  setDuration(audio.duration / 60); // in minutes
              }
          };
      }
  };

  const getPriceTokenString = () => {
      // Calculate based on current duration and priority
      const price = calculatePrice(duration || 1, priority);
      return price.toLocaleString();
  };

  const handlePlaceOrder = () => {
      if (!name || !fileName) return;

      setIsPaying(true);

      // Simulate Blockchain Transaction
      setTimeout(() => {
        const orderPrice = calculatePrice(duration || 1, priority);
        
        const newOrder: Order = {
            id: Math.random().toString(36).substr(2, 9),
            customerName: name,
            fileName: fileName,
            price: orderPrice,
            status: 'QUEUED',
            priority: priority,
            timestamp: Date.now(),
            fileData: fileData,
            mimeType: mimeType
        };

        setOrders(prev => {
            const list = [...prev, newOrder];
            return list.sort((a, b) => {
               if (a.priority === b.priority) return a.timestamp - b.timestamp;
               return a.priority === 'RUSH' ? -1 : 1;
            });
        });
        
        setActiveOrderId(newOrder.id);
        setIsPaying(false);
        setUiView('STATUS');
      }, 2500);
  };

  const handleDeliveryArrived = (deliveredIds: string[]) => {
      // Update statuses
      setOrders(prev => prev.map(o => {
          if (deliveredIds.includes(o.id)) {
              return { ...o, status: 'ON_TABLE' };
          }
          return o;
      }));
      // Update visual stack
      setPapersInStack(prev => prev + deliveredIds.length);
  };

  const handlePickup = () => {
      setOrders(prev => {
          const copy = [...prev];
          const nextOrderIndex = copy.findIndex(o => o.status === 'ON_TABLE');
          if (nextOrderIndex !== -1) {
              copy[nextOrderIndex] = { ...copy[nextOrderIndex], status: 'PROCESSING' };
          }
          return copy;
      });
  };

  const handleComplete = () => {
      setOrders(prev => {
          const copy = [...prev];
          const activeIndex = copy.findIndex(o => o.status === 'PROCESSING');
          if (activeIndex !== -1) {
              copy[activeIndex] = { ...copy[activeIndex], status: 'COMPLETED' };
          }
          return copy;
      });
  };

  const getMyOrder = () => orders.find(o => o.id === activeOrderId);
  
  const transcribingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
      orders.forEach(async (order) => {
          if (order.fileData && order.mimeType && !order.transcript && !transcribingIds.current.has(order.id)) {
              transcribingIds.current.add(order.id);
              try {
                  const transcript = await transcribeAudio(order.fileData, order.mimeType);
                  setOrders(prev => prev.map(o => 
                      o.id === order.id ? { ...o, transcript } : o
                  ));
              } catch (e) {
                  console.error("Failed to transcribe", e);
                  setOrders(prev => prev.map(o => 
                      o.id === order.id ? { ...o, transcript: "Transcription failed." } : o
                  ));
              }
          }
      });
  }, [orders]);

  const generateTranscript = (order: Order | undefined) => {
      if (!order) return "";
      
      const content = order.transcript || `[00:00:00] Speaker 1: This is an automatically generated transcript for the audio file submitted to the Maculeye Autonomous Unit.
[00:00:15] Speaker 2: The process was completed successfully on the blockchain.
[00:00:30] Speaker 1: End of transcript.`;

      return `TRANSCRIPT FOR: ${order.fileName}
DATE: ${new Date(order.timestamp).toLocaleDateString()}
CUSTOMER: ${order.customerName}

${content}
      `;
  };

  const handleDownload = () => {
      const order = getMyOrder();
      if (!order) return;
      const text = generateTranscript(order);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order.fileName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
       const order = getMyOrder();
       if (!order) return;
       const text = generateTranscript(order);
       navigator.clipboard.writeText(text);
       setCopySuccess(true);
       setTimeout(() => setCopySuccess(false), 2000);
  };
  
  const getQueuePosition = () => {
      const myOrder = getMyOrder();
      if (!myOrder || myOrder.status !== 'QUEUED') return 0;
      
      // Filter list to only queued items
      const queuedList = orders.filter(o => o.status === 'QUEUED');
      return queuedList.indexOf(myOrder) + 1;
  };
  
  // Active queue count (queued + delivering + on_table + processing)
  const activeClientCount = orders.filter(o => o.status !== 'COMPLETED').length;

  return (
    <div className="relative w-full h-screen bg-gray-900 font-sans">
      <div className="absolute bottom-4 left-4 z-10 w-96 flex flex-col gap-4">
          
          <div className="p-6 bg-slate-800/90 backdrop-blur-md rounded-xl border border-slate-600 shadow-2xl text-white transition-all max-h-[85vh] flex flex-col">
            <div className="flex flex-col gap-3 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 border border-emerald-500 overflow-hidden relative shadow-lg">
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                            <rect width="100" height="100" fill="#2c3e50" />
                            {/* Head */}
                            <rect x="20" y="20" width="60" height="60" fill="#bdc3c7" />
                            {/* Hair */}
                            <rect x="15" y="10" width="70" height="20" fill="#4a3b32" />
                            {/* Eyes */}
                            <rect x="35" y="45" width="10" height="10" fill="black" />
                            <rect x="55" y="45" width="10" height="10" fill="black" />
                            {/* Headphones */}
                            <rect x="10" y="30" width="10" height="40" fill="#ff6600" />
                            <rect x="80" y="30" width="10" height="40" fill="#ff6600" />
                            <rect x="15" y="15" width="70" height="5" fill="#ff6600" />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent leading-tight">
                            Maculeye V1.0
                        </h1>
                        <span className="text-[10px] text-emerald-400/80 font-mono tracking-wider">ONLINE</span>
                    </div>
                </div>
                
                {/* Main Navigation */}
                <div className="flex gap-2 border-b border-slate-700 pb-2">
                    <button 
                        onClick={() => setUiView('LANDING')}
                        className={`text-xs px-3 py-1.5 rounded transition-colors font-semibold ${uiView === 'LANDING' || uiView === 'JOB_SELECT' || uiView === 'FORM' || uiView === 'STATUS' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'text-gray-400 hover:text-white'}`}
                    >
                        Dashboard
                    </button>
                    <button 
                        onClick={() => setUiView('ABOUT')}
                        className={`text-xs px-3 py-1.5 rounded transition-colors font-semibold ${uiView === 'ABOUT' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'text-gray-400 hover:text-white'}`}
                    >
                        About
                    </button>
                    <button 
                        onClick={() => setUiView('TEAM')}
                        className={`text-xs px-3 py-1.5 rounded transition-colors font-semibold ${uiView === 'TEAM' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'text-gray-400 hover:text-white'}`}
                    >
                        Team
                    </button>
                </div>
            </div>
            
            {uiView === 'LANDING' && (
                <div className="space-y-4">
                    <p className="text-gray-300 text-sm">
                        Currently serving <span className="text-emerald-400 font-bold">{activeClientCount}</span> clients.
                    </p>
                    <button 
                        onClick={() => setUiView('JOB_SELECT')}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-lg shadow-lg"
                    >
                        Start New Job
                    </button>
                </div>
            )}

            {uiView === 'TEAM' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4 overflow-y-auto pr-2 custom-scrollbar">
                     <h3 className="text-sm font-semibold text-gray-400 sticky top-0 bg-slate-800/95 py-1 z-10">Operational Staff</h3>
                     
                     <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex gap-3 items-start">
                         <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-slate-600">
                             {/* Clawdarius SVG */}
                             <svg viewBox="0 0 100 100" className="w-full h-full">
                                <rect width="100" height="100" fill="#34495e" />
                                <rect x="20" y="20" width="60" height="60" fill="#bdc3c7" />
                                <rect x="15" y="10" width="70" height="20" fill="#4a3b32" />
                                <rect x="35" y="45" width="10" height="10" fill="black" />
                                <rect x="55" y="45" width="10" height="10" fill="black" />
                                <rect x="10" y="30" width="10" height="40" fill="#ff6600" />
                                <rect x="80" y="30" width="10" height="40" fill="#ff6600" />
                                <rect x="15" y="15" width="70" height="5" fill="#ff6600" />
                            </svg>
                         </div>
                         <div>
                             <h4 className="text-emerald-400 font-bold text-xs uppercase">Clawdarius</h4>
                             <span className="text-[10px] text-gray-500 font-mono block mb-1">Role: Worker / Chief Processing Officer</span>
                             <p className="text-xs text-gray-400 leading-snug">
                                 The tireless engine of the operation. Configured for maximum throughput, Clawdarius listens to 24/7 lo-fi beats while processing complex audio data. Never takes a break, never complains.
                             </p>
                         </div>
                     </div>

                     <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex gap-3 items-start">
                         <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-slate-600">
                             {/* BAE SVG */}
                             <svg viewBox="0 0 100 100" className="w-full h-full">
                                <rect width="100" height="100" fill="#8e44ad" />
                                <rect x="20" y="20" width="60" height="60" fill="#bdc3c7" />
                                <rect x="15" y="10" width="70" height="25" fill="#d35400" />
                                <rect x="10" y="10" width="15" height="80" fill="#d35400" />
                                <rect x="75" y="10" width="15" height="80" fill="#d35400" />
                                <rect x="35" y="45" width="10" height="10" fill="black" />
                                <rect x="55" y="45" width="10" height="10" fill="black" />
                            </svg>
                         </div>
                         <div>
                             <h4 className="text-purple-400 font-bold text-xs uppercase">BAE</h4>
                             <span className="text-[10px] text-gray-500 font-mono block mb-1">Role: Business Admin Assistant</span>
                             <p className="text-xs text-gray-400 leading-snug">
                                 The gatekeeper of the inbox. BAE ensures that only valid, blockchain-verified packets make it to the main desk. Manages the logistics of the intake dropzone with ruthless efficiency.
                             </p>
                         </div>
                     </div>

                     <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex gap-3 items-start">
                         <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-slate-600">
                             {/* Larry SVG */}
                             <svg viewBox="0 0 100 100" className="w-full h-full">
                                <rect width="100" height="100" fill="#2980b9" />
                                <rect x="20" y="20" width="60" height="60" fill="#bdc3c7" />
                                <rect x="15" y="25" width="70" height="20" fill="#4a3b32" />
                                <rect x="15" y="5" width="70" height="20" fill="#7f8c8d" />
                                <rect x="15" y="20" width="80" height="5" fill="#7f8c8d" />
                                <rect x="35" y="45" width="10" height="10" fill="black" />
                                <rect x="55" y="45" width="10" height="10" fill="black" />
                            </svg>
                         </div>
                         <div>
                             <h4 className="text-blue-400 font-bold text-xs uppercase">Larry</h4>
                             <span className="text-[10px] text-gray-500 font-mono block mb-1">Role: Data Management Specialist</span>
                             <p className="text-xs text-gray-400 leading-snug">
                                 Responsible for the physical retention and disposal of processed data tapes. Larry navigates the complexities of the corridor to ensure the output buffer never overflows.
                             </p>
                         </div>
                     </div>
                </div>
            )}

            {uiView === 'ABOUT' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 overflow-y-auto pr-2 custom-scrollbar max-h-[60vh]">
                    <div className="text-sm text-gray-300 space-y-4 leading-relaxed">
                        <div className="p-3 bg-gradient-to-r from-emerald-900/40 to-slate-900/40 border border-emerald-500/30 rounded-lg">
                             <h4 className="text-emerald-400 font-bold text-sm mb-1">The Economic Singularity</h4>
                             <p className="text-xs">
                                 Maculeye represents a paradigm shift in digital labor. We are witnessing the birth of the first truly autonomous economic agents. Maculeye operates 24/7, negotiating its own resources and upgrading its own capabilities without human intervention.
                             </p>
                        </div>

                        <p>
                            <strong className="text-emerald-400">Maculeye</strong> is an autonomous AI entrepreneur who only accepts crypto.
                        </p>
                        
                        <div className="space-y-3">
                            <div className="p-3 bg-slate-900/50 rounded-lg border border-emerald-500/20">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <h4 className="text-emerald-400 font-bold text-xs uppercase">$MACULEYE</h4>
                                </div>
                                <p className="text-xs text-gray-400">
                                    Represents ownership of the bot instance. Holders earn a portion of the fees collected. They can have input into upgrades and future skills but do not have governance.
                                </p>
                            </div>

                            <div className="p-3 bg-slate-900/50 rounded-lg border border-cyan-500/20">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                                    <h4 className="text-cyan-400 font-bold text-xs uppercase">$COMPUTE</h4>
                                </div>
                                <p className="text-xs text-gray-400">
                                    The operational currency. Maculeye is paid in $COMPUTE, which he burns to cover his own API fees, server costs, and rent.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 border-t border-slate-700 pt-4">
                            <h3 className="text-sm font-bold text-gray-200 mb-3">Roadmap</h3>
                            <div className="space-y-4 relative pl-4 border-l border-slate-700 ml-1">
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-800"></div>
                                    <h5 className="text-xs font-bold text-emerald-400">Phase 1: Genesis (Current)</h5>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Launch of Maculeye V1.0. Core audio transcription capabilities. Basic crypto payment integration. Establishment of the $COMPUTE economy.
                                    </p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-800"></div>
                                    <h5 className="text-xs font-bold text-gray-300">Phase 2: Multi-Modal Expansion</h5>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Integration of YouTube video analysis and PDF document scanning. Maculeye will learn to "read" and "watch," expanding his service offerings.
                                    </p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-800"></div>
                                    <h5 className="text-xs font-bold text-gray-300">Phase 3: Autonomous Upgrades</h5>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Maculeye gains write-access to his own codebase. He will begin optimizing his own pathfinding algorithms and efficiency metrics using earned $COMPUTE.
                                    </p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-800"></div>
                                    <h5 className="text-xs font-bold text-gray-300">Phase 4: The Swarm</h5>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Maculeye uses retained earnings to spin up subsidiary bots (Workers 2 through 10), creating a fully decentralized digital agency.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {uiView === 'JOB_SELECT' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-gray-400">Select Job Type</h3>
                        <button onClick={() => setUiView('LANDING')} className="text-xs text-gray-500 hover:text-white">Cancel</button>
                    </div>

                    <button 
                        onClick={() => setUiView('FORM')}
                        className="w-full text-left p-4 rounded-lg border border-emerald-500/50 bg-emerald-900/20 hover:bg-emerald-900/40 hover:border-emerald-400 transition-all group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-emerald-400 text-sm">Audio &gt; Text Transcription</span>
                            <span className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">Active</span>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">High-fidelity conversion of audio files to formatted text documents.</p>
                    </button>

                    <button disabled className="w-full text-left p-4 rounded-lg border border-slate-700 bg-slate-800/40 opacity-50 cursor-not-allowed group">
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-gray-400 text-sm group-hover:text-gray-300 transition-colors">Youtube Video Transcription</span>
                            <span className="text-[9px] uppercase font-bold bg-slate-700/50 text-gray-500 px-1.5 py-0.5 rounded border border-slate-600/50">Coming Soon</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors">Extract and format spoken content from YouTube URLs.</p>
                    </button>

                    <button disabled className="w-full text-left p-4 rounded-lg border border-slate-700 bg-slate-800/40 opacity-50 cursor-not-allowed group">
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-gray-400 text-sm group-hover:text-gray-300 transition-colors">Bank Statement Conversion</span>
                            <span className="text-[9px] uppercase font-bold bg-slate-700/50 text-gray-500 px-1.5 py-0.5 rounded border border-slate-600/50">Coming Soon</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors">Digitize and categorize transactions from PDF statements.</p>
                    </button>
                </div>
            )}

            {uiView === 'FORM' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4 relative">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-gray-400">Transcription Details</h3>
                        <button onClick={() => setUiView('JOB_SELECT')} className="text-xs text-gray-500 hover:text-white" disabled={isPaying}>Back</button>
                    </div>
                    
                    <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} disabled={isPaying} className="w-full bg-slate-900/50 border border-slate-600 rounded px-3 py-2 text-sm text-white disabled:opacity-50" />
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} disabled={isPaying} className="w-full bg-slate-900/50 border border-slate-600 rounded px-3 py-2 text-sm text-white disabled:opacity-50" />
                    
                    <div className="relative">
                        <input type="file" id="f" className="hidden" accept="audio/*" onChange={handleFileChange} disabled={isPaying} />
                        <label htmlFor="f" className={`w-full flex justify-between bg-slate-900/50 border border-dashed rounded px-3 py-2 text-sm cursor-pointer ${fileName ? 'border-emerald-500 text-emerald-400' : 'border-slate-600 text-gray-400'} ${isPaying ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <span className="truncate">{fileName || "Upload Audio File"}</span>
                            <span>Upload</span>
                        </label>
                    </div>

                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setPriority('STANDARD')} disabled={isPaying} className={`flex-1 py-2 text-xs rounded border ${priority === 'STANDARD' ? 'bg-slate-700 border-emerald-500 text-white' : 'border-slate-600 text-gray-400'} disabled:opacity-50`}>
                            Standard
                        </button>
                        <button onClick={() => setPriority('RUSH')} disabled={isPaying} className={`flex-1 py-2 text-xs rounded border ${priority === 'RUSH' ? 'bg-amber-900/30 border-amber-500 text-amber-200' : 'border-slate-600 text-gray-400'} disabled:opacity-50`}>
                            Rush (2x)
                        </button>
                    </div>

                    <div className="text-[10px] text-gray-500 mt-2 bg-slate-800/50 p-2 rounded border border-slate-700/50">
                        <span className="text-red-400 font-bold">* NO REFUND POLICY:</span> By proceeding, you acknowledge that all blockchain transactions are final and irreversible.
                    </div>

                    <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-slate-700">
                        <span className="text-gray-400">Queue Position:</span>
                        <span className="text-white font-mono">{priority === 'RUSH' ? '1-2 (Rush)' : orders.filter(o => o.status === 'QUEUED').length + 1}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Total:</span>
                        <span className="text-xl font-bold text-emerald-400">{getPriceTokenString()} $COMPUTE</span>
                    </div>

                    <button 
                        onClick={handlePlaceOrder} 
                        disabled={!name || !fileName || isPaying} 
                        className={`w-full mt-2 text-white font-bold py-3 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all ${isPaying ? 'bg-slate-700' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                    >
                        {isPaying ? (
                           <>
                               <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                               <span>Verifying on Blockchain...</span>
                           </>
                        ) : (
                           <span>Pay & Start Job (Crypto)</span>
                        )}
                    </button>
                </div>
            )}

            {uiView === 'STATUS' && getMyOrder() && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-gray-400">Order Status</h3>
                        <button onClick={() => { setActiveOrderId(null); setUiView('LANDING'); }} className="text-xs text-gray-500 hover:text-white">New Job</button>
                    </div>
                    <div className="bg-slate-900/80 p-4 rounded-lg border border-slate-700">
                        <div className="flex justify-between mb-2">
                            <span className="text-xs text-gray-400">File:</span>
                            <span className="text-xs text-white truncate max-w-[120px]">{getMyOrder()?.fileName}</span>
                        </div>
                         <div className="flex justify-between mb-4">
                            <span className="text-xs text-gray-400">Priority:</span>
                            <span className={`text-xs font-bold ${getMyOrder()?.priority === 'RUSH' ? 'text-amber-400' : 'text-gray-300'}`}>{getMyOrder()?.priority}</span>
                        </div>
                        
                        <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2">
                             <div className={`h-2.5 rounded-full transition-all duration-500 ${
                                 getMyOrder()?.status === 'COMPLETED' ? 'w-full bg-emerald-500' :
                                 getMyOrder()?.status === 'PROCESSING' ? 'w-2/3 bg-yellow-400' :
                                 getMyOrder()?.status === 'ON_TABLE' ? 'w-1/3 bg-blue-500' :
                                 'w-1/12 bg-gray-500'
                             }`}></div>
                        </div>
                        <div className="text-center text-sm font-medium">
                            {getMyOrder()?.status === 'QUEUED' && <span className="text-blue-400">Queue Pos: {getQueuePosition()}</span>}
                            {getMyOrder()?.status === 'ON_TABLE' && <span className="text-blue-300">In Inbox (Pos: {orders.filter(o => o.status === 'ON_TABLE').indexOf(getMyOrder()!) + 1})</span>}
                            {getMyOrder()?.status === 'PROCESSING' && <span className="text-yellow-400 animate-pulse">Processing Audio...</span>}
                            {getMyOrder()?.status === 'COMPLETED' && <span className="text-emerald-400">Ready for Download</span>}
                        </div>
                    </div>

                    {getMyOrder()?.status === 'COMPLETED' && (
                        <div className="flex gap-2">
                            <button 
                                onClick={handleDownload}
                                className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-2 rounded flex items-center justify-center gap-2 text-xs font-bold transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Download
                            </button>
                            <button 
                                onClick={handleCopy}
                                className={`flex-1 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold transition-colors ${copySuccess ? 'bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-gray-200'}`}
                            >
                                {copySuccess ? (
                                    <>
                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                       Copied!
                                    </>
                                ) : (
                                    <>
                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                       Copy Text
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
          </div>
      </div>

      <Canvas shadows camera={{ position: [8, 8, 8], fov: 40 }}>
        <color attach="background" args={['#1e1e1e']} />
        
        <ambientLight intensity={0.5} />
        <directionalLight 
            position={[10, 20, 10]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize={[2048, 2048]}
        >
          <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10]} />
        </directionalLight>
        <pointLight position={[0, 5, 0]} intensity={0.5} color="#ffdcae" />

        <OrbitControls target={[0, 0, 0]} minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} />

        <Suspense fallback={null}>
            <SimulationLogic 
                papersInStack={papersInStack} 
                papersProcessed={papersProcessed}
                setPapersInStack={setPapersInStack} 
                setPapersProcessed={setPapersProcessed}
                orders={orders}
                onDeliveryArrived={handleDeliveryArrived}
                onPickup={handlePickup}
                onComplete={handleComplete}
            />
            
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[100, 100]} />
                <shadowMaterial opacity={0.3} />
            </mesh>
        </Suspense>
      </Canvas>
    </div>
  );
};

export default App;