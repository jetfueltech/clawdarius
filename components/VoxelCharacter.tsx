import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Vector3, Euler } from 'three';
import { WorkerState, COLORS } from '../types';

interface VoxelCharacterProps {
  position: Vector3;
  rotation: Euler | number | React.MutableRefObject<number>;
  state?: WorkerState;
  hasPaper: boolean;
  showHeadphones: boolean;
  variant?: 'male' | 'female' | 'janitor';
  isJanitorFull?: boolean; // Prop to show tapes in bin
}

export const VoxelCharacter: React.FC<VoxelCharacterProps> = ({
  position,
  rotation,
  state = WorkerState.IDLE,
  hasPaper,
  showHeadphones,
  variant = 'male',
  isJanitorFull = false
}) => {
  const groupRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);

  // States
  const isWalking = [
    WorkerState.WALKING_TO_INTAKE,
    WorkerState.WALKING_TO_DESK,
    WorkerState.WALKING_TO_OUTPUT,
    WorkerState.STANDING_UP,
    WorkerState.WALKING_TO_PLANT_L,
    WorkerState.WALKING_TO_PLANT_R,
    WorkerState.RETURNING_FROM_PLANTS,
    WorkerState.WALKING_TO_ARCHIVE,
    // Assistant specific
    WorkerState.ASSISTANT_WALKING_TO_INBOX,
    WorkerState.ASSISTANT_WALKING_HOME,
    WorkerState.ASSISTANT_WALKING_TO_DROPZONE,
    WorkerState.ASSISTANT_WALKING_TO_DOOR_NODE, 
    WorkerState.ASSISTANT_WALKING_OUT_DOOR
  ].includes(state);

  const isMoving = isWalking; 

  const isSitting = [
    WorkerState.WORKING,
    WorkerState.SITTING_DOWN,
    WorkerState.INSERTING_TAPE,
    WorkerState.IDLE,
    WorkerState.GAMING,
    WorkerState.SLEEPING,
    // Assistant
    WorkerState.ASSISTANT_SITTING
  ].includes(state);

  const isDepositing = state === WorkerState.DEPOSITING || state === WorkerState.ASSISTANT_DROPPING;
  const isArchiving = state === WorkerState.ARCHIVING_TAPE;
  const isWalkingToArchive = state === WorkerState.WALKING_TO_ARCHIVE;
  const isWorking = state === WorkerState.WORKING;
  const isInsertingTape = state === WorkerState.INSERTING_TAPE;
  const isGaming = state === WorkerState.GAMING;
  const isSleeping = state === WorkerState.SLEEPING;
  const isWatering = state === WorkerState.WATERING_L || state === WorkerState.WATERING_R;
  
  const showTapeInHand = hasPaper && !isWorking && !isInsertingTape && state !== WorkerState.IDLE && state !== WorkerState.SLEEPING && state !== WorkerState.GAMING && variant === 'male';

  const showPaperInHand = hasPaper && 
                          !isSitting && 
                          !isDepositing && 
                          !isArchiving && 
                          !isWalkingToArchive && 
                          state !== WorkerState.IDLE;

  const isJanitor = variant === 'janitor';

  useFrame((stateThree, delta) => {
    if (!groupRef.current) return;
    
    // Sync position
    groupRef.current.position.copy(position);
    
    // Sync Rotation
    if (typeof rotation === 'number') {
        groupRef.current.rotation.y = rotation;
    } else if (rotation && 'current' in rotation) {
        groupRef.current.rotation.y = rotation.current;
    }

    const time = stateThree.clock.getElapsedTime();

    // 1. Walking Animation
    if (isMoving) {
      const speed = 10;
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = Math.sin(time * speed) * 0.5;
        rightLegRef.current.rotation.x = Math.sin(time * speed + Math.PI) * 0.5;
      }
      
      // Janitor pushes bin (arms static forward), others swing arms
      if (isJanitor) {
          if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 3;
          if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 3;
      } else {
          if (leftArmRef.current && rightArmRef.current) {
            leftArmRef.current.rotation.x = Math.sin(time * speed + Math.PI) * 0.5;
            rightArmRef.current.rotation.x = Math.sin(time * speed) * 0.5;
          }
      }

      if (bodyRef.current) {
        bodyRef.current.position.y = 0.75 + Math.sin(time * speed * 2) * 0.05;
      }
      if (headRef.current) headRef.current.rotation.x = 0;
    } 
    // 2. Sitting Animation
    else if (isSitting) {
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = -Math.PI / 2;
        rightLegRef.current.rotation.x = -Math.PI / 2;
      }
      
      // Adjust body position to align with chair better
      // Chair surface is ~0.4. Center of body (height 0.55) is at 0.75 when standing.
      // When sitting, center should be around 0.4 + (0.55/2) = ~0.675
      // Plus visual adjustment.
      if (bodyRef.current) {
        bodyRef.current.position.y = 0.65;
        // Shift back slightly to sit "in" chair
        bodyRef.current.position.z = -0.1; 
      }

      if (isSleeping) {
          if (headRef.current) {
             headRef.current.rotation.x = MathUtils.lerp(headRef.current.rotation.x, Math.PI / 2.5, delta * 2);
          }
          if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 2.2;
          if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 2.2;
          if (bodyRef.current) bodyRef.current.position.y = 0.65 + Math.sin(time * 1.5) * 0.01;
      }
      else if (isGaming) {
           if (rightArmRef.current) {
               rightArmRef.current.rotation.x = -Math.PI / 3;
               rightArmRef.current.rotation.z = -0.2;
           }
           if (leftArmRef.current) {
               leftArmRef.current.rotation.x = -Math.PI / 3;
               leftArmRef.current.rotation.z = 0.2;
           }
           if (headRef.current) headRef.current.rotation.x = Math.sin(time * 10) * 0.1; 
      }
      else if (isInsertingTape) {
          if (leftArmRef.current) {
              leftArmRef.current.rotation.x = MathUtils.lerp(leftArmRef.current.rotation.x, -Math.PI / 2.5, delta * 5);
              leftArmRef.current.rotation.z = MathUtils.lerp(leftArmRef.current.rotation.z, 0.5, delta * 5); 
          }
          if (headRef.current) {
               headRef.current.rotation.y = MathUtils.lerp(headRef.current.rotation.y, 0.5, delta * 5);
          }
          if (rightArmRef.current) {
              rightArmRef.current.rotation.x = -Math.PI / 3;
              rightArmRef.current.rotation.z = -0.2;
          }
      }
      else if (isWorking) {
           // Reset body z shift for main worker who leans forward
           if (bodyRef.current) bodyRef.current.position.z = 0;

          if (headRef.current) headRef.current.rotation.y = MathUtils.lerp(headRef.current.rotation.y, 0, delta * 5);
          
          if (rightArmRef.current && leftArmRef.current) {
             rightArmRef.current.rotation.x = -Math.PI / 3 + Math.sin(time * 20) * 0.1;
             rightArmRef.current.rotation.z = -0.2;
             leftArmRef.current.rotation.x = -Math.PI / 3;
             leftArmRef.current.rotation.z = 0; 
          }
          if (headRef.current) headRef.current.rotation.x = 0.2 + Math.sin(time * 3) * 0.05;
      } 
      else {
           // Idle Sitting
           if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 4;
           if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 4;
           if (headRef.current) headRef.current.rotation.x = 0;
           if (headRef.current) headRef.current.rotation.y = 0;
      }
    } 
    // 3. Watering Plants
    else if (isWatering) {
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        if (rightArmRef.current) {
            rightArmRef.current.rotation.x = -Math.PI / 3;
            rightArmRef.current.rotation.z = Math.sin(time * 8) * 0.2; 
        }
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
        if (headRef.current) headRef.current.rotation.x = 0.3;
    }
    // 4. Depositing or Archiving
    else if (isDepositing || isArchiving) {
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        
        if (isDepositing) {
             if (rightArmRef.current) {
                rightArmRef.current.rotation.x = MathUtils.lerp(rightArmRef.current.rotation.x, -Math.PI / 4, delta * 5);
             }
        } else {
             if (leftArmRef.current) {
                leftArmRef.current.rotation.x = MathUtils.lerp(leftArmRef.current.rotation.x, -Math.PI / 4, delta * 5);
             }
        }
    }
    else {
      // Default Stand
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
      if (bodyRef.current) {
          bodyRef.current.position.y = 0.75;
          bodyRef.current.position.z = 0;
      }
      if (headRef.current) headRef.current.rotation.x = 0;
    }
  });

  const headSize = 0.4;
  const bodyWidth = 0.45;
  const bodyHeight = 0.55;
  const limbWidth = 0.15;
  const limbLength = 0.55;

  let hairColor = COLORS.HAIR;
  let shirtColor = COLORS.SHIRT;
  let pantsColor = COLORS.PANTS;

  if (variant === 'female') {
      hairColor = COLORS.FEMALE_HAIR;
      shirtColor = COLORS.FEMALE_SHIRT;
  } else if (variant === 'janitor') {
      shirtColor = COLORS.JANITOR_SHIRT;
      pantsColor = COLORS.JANITOR_PANTS;
  }

  const CassetteTape = () => (
      <group>
          <mesh castShadow>
              <boxGeometry args={[0.25, 0.15, 0.05]} />
              <meshStandardMaterial color={COLORS.TAPE} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
               <planeGeometry args={[0.2, 0.08]} />
               <meshStandardMaterial color={COLORS.TAPE_LABEL} />
          </mesh>
           <mesh position={[-0.06, 0, 0.031]}>
               <circleGeometry args={[0.025, 8]} />
               <meshBasicMaterial color="#000" />
           </mesh>
            <mesh position={[0.06, 0, 0.031]}>
               <circleGeometry args={[0.025, 8]} />
               <meshBasicMaterial color="#000" />
           </mesh>
      </group>
  )
  
  const RollingBin = () => (
      <group position={[0, 0.4, 0.8]}>
          {/* Bin Body */}
          <mesh castShadow receiveShadow>
              <boxGeometry args={[0.6, 0.6, 0.8]} />
              <meshStandardMaterial color={COLORS.JANITOR_BIN} />
          </mesh>
          <mesh position={[0, 0.31, 0]}>
              <boxGeometry args={[0.5, 0.02, 0.7]} />
              <meshStandardMaterial color="#000" />
          </mesh>
          
          {/* Handle */}
          <mesh position={[0, 0.35, -0.45]} rotation={[0.5, 0, 0]}>
               <cylinderGeometry args={[0.02, 0.02, 0.3]} />
               <meshStandardMaterial color="#333" />
          </mesh>
          <mesh position={[0, 0.45, -0.55]} rotation={[0, 0, Math.PI/2]}>
               <cylinderGeometry args={[0.02, 0.02, 0.6]} />
               <meshStandardMaterial color="#333" />
          </mesh>

          {/* Wheels */}
          <mesh position={[0.25, -0.35, 0.3]}>
              <cylinderGeometry args={[0.05, 0.05, 0.05]} rotation={[0,0,Math.PI/2]} />
              <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[-0.25, -0.35, 0.3]}>
              <cylinderGeometry args={[0.05, 0.05, 0.05]} rotation={[0,0,Math.PI/2]} />
              <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[0.25, -0.35, -0.3]}>
              <cylinderGeometry args={[0.05, 0.05, 0.05]} rotation={[0,0,Math.PI/2]} />
              <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[-0.25, -0.35, -0.3]}>
              <cylinderGeometry args={[0.05, 0.05, 0.05]} rotation={[0,0,Math.PI/2]} />
              <meshStandardMaterial color="#111" />
          </mesh>
          
          {/* Content if full */}
          {isJanitorFull && (
              <group position={[0, 0.35, 0]}>
                   {[...Array(6)].map((_, i) => (
                       <mesh key={i} position={[(Math.random()-0.5)*0.4, (Math.random())*0.2, (Math.random()-0.5)*0.6]} rotation={[Math.random(), Math.random(), Math.random()]}>
                           <boxGeometry args={[0.2, 0.1, 0.05]} />
                           <meshStandardMaterial color={COLORS.TAPE} />
                       </mesh>
                   ))}
              </group>
          )}
      </group>
  )

  return (
    <group 
      ref={groupRef} 
      dispose={null}
    >
      
      <group ref={bodyRef} position={[0, 0.75, 0]}>
        
        {/* HEAD */}
        <group ref={headRef} position={[0, bodyHeight / 2 + headSize / 2, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[headSize, headSize, headSize]} />
            <meshStandardMaterial color={COLORS.SKIN} />
          </mesh>

          {/* EYES */}
          <group position={[0, 0, headSize/2 + 0.01]}>
              <mesh position={[0.08, 0.05, 0]}>
                  <boxGeometry args={[0.05, 0.05, 0.01]} />
                  <meshStandardMaterial color="black" />
              </mesh>
              <mesh position={[-0.08, 0.05, 0]}>
                  <boxGeometry args={[0.05, 0.05, 0.01]} />
                  <meshStandardMaterial color="black" />
              </mesh>
          </group>
          
          {/* Hair */}
          <mesh position={[0, headSize/2 + 0.05, 0]} castShadow>
             <boxGeometry args={[headSize + 0.05, 0.1, headSize + 0.05]} />
             <meshStandardMaterial color={hairColor} />
          </mesh>
          {variant === 'female' && (
              <mesh position={[0, 0, -headSize/2 - 0.1]} castShadow>
                   <boxGeometry args={[0.2, 0.4, 0.2]} />
                   <meshStandardMaterial color={hairColor} />
              </mesh>
          )}
          
          {showHeadphones && (
            <group>
               <mesh position={[headSize/2 + 0.05, 0, 0]}>
                 <boxGeometry args={[0.1, 0.25, 0.2]} />
                 <meshStandardMaterial color={COLORS.HEADPHONES} />
               </mesh>
               <mesh position={[-headSize/2 - 0.05, 0, 0]}>
                 <boxGeometry args={[0.1, 0.25, 0.2]} />
                 <meshStandardMaterial color={COLORS.HEADPHONES} />
               </mesh>
               <mesh position={[0, headSize/2 + 0.1, 0]}>
                  <boxGeometry args={[headSize + 0.2, 0.05, 0.05]} />
                  <meshStandardMaterial color={COLORS.HEADPHONES} />
               </mesh>
            </group>
          )}
        </group>

        {/* TORSO */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[bodyWidth, bodyHeight, 0.25]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>

        {/* ARMS */}
        <group ref={leftArmRef} position={[-bodyWidth/2 - limbWidth/2, bodyHeight/2 - 0.1, 0]}>
          <mesh position={[0, -limbLength/2, 0]} castShadow>
            <boxGeometry args={[limbWidth, limbLength, limbWidth]} />
            <meshStandardMaterial color={COLORS.SKIN} />
          </mesh>
          {/* Tape in Left Hand */}
          {showTapeInHand && (
              <group position={[0, -limbLength, 0.15]} rotation={[0, 0, -Math.PI/2]}>
                  <CassetteTape />
              </group>
          )}
        </group>

        <group ref={rightArmRef} position={[bodyWidth/2 + limbWidth/2, bodyHeight/2 - 0.1, 0]}>
           <mesh position={[0, -limbLength/2, 0]} castShadow>
            <boxGeometry args={[limbWidth, limbLength, limbWidth]} />
            <meshStandardMaterial color={COLORS.SKIN} />
          </mesh>
           
           {/* Paper in Right Hand */}
           {showPaperInHand && (
              <mesh position={[0, -limbLength, 0.15]} rotation={[0.5, 0, 0]}>
                  <boxGeometry args={[0.25, 0.35, 0.01]} />
                  <meshStandardMaterial color={COLORS.PAPER} />
              </mesh>
           )}

           {/* Watering Can */}
           {isWatering && (
             <group position={[0, -limbLength, 0.2]}>
               <mesh castShadow>
                 <cylinderGeometry args={[0.15, 0.15, 0.25]} />
                 <meshStandardMaterial color="#3498db" />
               </mesh>
               <mesh position={[0, 0.05, 0.2]} rotation={[Math.PI/4, 0, 0]}>
                  <cylinderGeometry args={[0.02, 0.04, 0.2]} />
                  <meshStandardMaterial color="#2980b9" />
               </mesh>
               <mesh position={[0, 0, -0.15]} rotation={[Math.PI/4, 0, 0]}>
                   <torusGeometry args={[0.08, 0.02, 8, 12]} />
                   <meshStandardMaterial color="#2c3e50" />
               </mesh>
             </group>
           )}
        </group>
      </group>

      {/* LEGS */}
      <group position={[0, 0.5, 0]}>
        <group ref={leftLegRef} position={[-0.12, 0, 0]}>
           <mesh position={[0, -limbLength/2, 0]} castShadow>
             <boxGeometry args={[limbWidth, limbLength, limbWidth]} />
             <meshStandardMaterial color={pantsColor} />
           </mesh>
        </group>
        <group ref={rightLegRef} position={[0.12, 0, 0]}>
           <mesh position={[0, -limbLength/2, 0]} castShadow>
             <boxGeometry args={[limbWidth, limbLength, limbWidth]} />
             <meshStandardMaterial color={pantsColor} />
           </mesh>
        </group>
      </group>
      
      {/* Janitor Rolling Bin */}
      {isJanitor && <RollingBin />}

    </group>
  );
};