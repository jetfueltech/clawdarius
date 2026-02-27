import { Vector3 } from 'three';

export enum WorkerState {
  IDLE = 'IDLE', // Sitting at desk, waiting/deciding
  
  // Work Loop
  WALKING_TO_INTAKE = 'WALKING_TO_INTAKE',
  PICKING_UP = 'PICKING_UP',
  WALKING_TO_DESK = 'WALKING_TO_DESK',
  SITTING_DOWN = 'SITTING_DOWN',
  INSERTING_TAPE = 'INSERTING_TAPE',
  WORKING = 'WORKING',
  STANDING_UP = 'STANDING_UP',
  WALKING_TO_OUTPUT = 'WALKING_TO_OUTPUT',
  DEPOSITING = 'DEPOSITING',
  WALKING_TO_ARCHIVE = 'WALKING_TO_ARCHIVE', 
  ARCHIVING_TAPE = 'ARCHIVING_TAPE',         

  // Idle Activities
  SLEEPING = 'SLEEPING',
  GAMING = 'GAMING',
  WALKING_TO_PLANT_L = 'WALKING_TO_PLANT_L',
  WATERING_L = 'WATERING_L',
  WALKING_TO_PLANT_R = 'WALKING_TO_PLANT_R',
  WATERING_R = 'WATERING_R',
  RETURNING_FROM_PLANTS = 'RETURNING_FROM_PLANTS',
  
  // Assistant Specific
  ASSISTANT_SITTING = 'ASSISTANT_SITTING',
  ASSISTANT_WALKING_TO_DROPZONE = 'ASSISTANT_WALKING_TO_DROPZONE',
  ASSISTANT_WAITING_FOR_CLAW = 'ASSISTANT_WAITING_FOR_CLAW',
  ASSISTANT_PICKING_UP = 'ASSISTANT_PICKING_UP',
  ASSISTANT_WALKING_TO_DOOR_NODE = 'ASSISTANT_WALKING_TO_DOOR_NODE', // Intermediate path
  ASSISTANT_WALKING_TO_INBOX = 'ASSISTANT_WALKING_TO_INBOX',
  ASSISTANT_DROPPING = 'ASSISTANT_DROPPING',
  ASSISTANT_WALKING_OUT_DOOR = 'ASSISTANT_WALKING_OUT_DOOR', // Intermediate path
  ASSISTANT_WALKING_HOME = 'ASSISTANT_WALKING_HOME'
}

export type OrderStatus = 'QUEUED' | 'DELIVERING' | 'ON_TABLE' | 'PROCESSING' | 'COMPLETED';
export type PriorityLevel = 'STANDARD' | 'RUSH';

export interface Order {
  id: string;
  customerName: string;
  fileName: string;
  price: number;
  status: OrderStatus;
  priority: PriorityLevel;
  timestamp: number;
  fileData?: string;
  transcript?: string;
}

export interface SimulationState {
  papersInStack: number;
  papersProcessed: number;
  isHeadphonesOn: boolean;
  workerState: WorkerState;
}

export const LOCATIONS = {
  DESK_SEAT: new Vector3(0, 0, 0.5),
  STAND_POS: new Vector3(0, 0, -0.5), 
  
  INTAKE: new Vector3(-3.0, 0, 0.5), 
  OUTPUT: new Vector3(3.0, 0, -2.0), 
  ARCHIVE_TARGET: new Vector3(6.5, 0, -3.5), 
  
  DESK_WORK_POS: new Vector3(0, 0.75, 1.2),
  
  // Assistant Logic (Outside)
  // Wall is at x = -5.0. 
  // Moved further back (negative Z) to avoid door at z=1.5
  ASSISTANT_SEAT: new Vector3(-8.0, 0, -1.5), 
  ASSISTANT_DESK: new Vector3(-8.0, 0, -2.5), // In front of seat (facing -Z)
  ASSISTANT_INBOX_TARGET: new Vector3(-3.0, 0, 1.5), 
  
  // Dropzone moved to avoid door, aligned closer to assistant's new spot
  DROPZONE_TABLE: new Vector3(-6.0, 0, -1.5),
  DROPZONE_WAIT_POS: new Vector3(-6.0, 0, -2.5), 
  CLAW_POS: new Vector3(-6.0, 0, -1.5),

  // New Path Node to align with door (x=-6, z=1.5) before walking through door (x=-5, z=1.5)
  ASSISTANT_PATH_NODE: new Vector3(-6.0, 0, 1.5),

  // Janitor Logic (Hallway)
  // Hallway is z > 2.5
  JANITOR_SPAWN: new Vector3(-14.0, 0, 3.5),
  DELIVERY_ENTRY: new Vector3(-4.5, 0, 3.5), // Inside the Janitor door
  JANITOR_RACK_POS: new Vector3(6.5, 0, -2.5),
  WALKWAY_POINT: new Vector3(3.5, 0, 3.5), // Walk along the wall inside
  
  // Pathfinding Hubs
  HALLWAY_FRONT_Z: 0.5,
  HALLWAY_BACK_Z: -2.5,
  TRANSITION_X: 0, 
  
  // Plant Locations
  PLANT_L_TARGET: new Vector3(-4.0, 0, -3.0),
  PLANT_R_TARGET: new Vector3(8.0, 0, -3.5), // Moved right of rack (rack is at x=6.5)
  
  // Legacy unused but required by type defs if any
  DELIVERY_TARGET: new Vector3(-4.5, 0, 0.5) 
};

export const COLORS = {
  SKIN: '#bdc3c7', // Robot Grey
  SHIRT: '#ffffff',
  PANTS: '#2c3e50',
  SHOES: '#111111',
  HAIR: '#4a3b32', // Dark Brown
  HEADPHONES: '#ff6600', // Orange
  DESK: '#5d4037', 
  PAPER: '#f3f4f6',
  FLOOR: '#7f8c8d', 
  WALL: '#e6d7b9', // Light Tan Brown
  TICKER_BG: '#2c3e50',
  TICKER_TEXT: '#f39c12',
  FEMALE_HAIR: '#d35400', // Auburn
  FEMALE_SHIRT: '#9b59b6',
  JANITOR_SHIRT: '#7f8c8d',
  JANITOR_PANTS: '#58636d',
  CHUTE: '#95a5a6',
  BIN: '#34495e',
  CONVEYOR: '#2c3e50',
  TAPE: '#111111',
  TAPE_LABEL: '#f1c40f',
  TAPE_PLAYER: '#34495e',
  WHITEBOARD_FRAME: '#95a5a6',
  WHITEBOARD_SURFACE: '#ffffff',
  ARCHIVE_RACK: '#555555',
  KANBAN_BG: '#2c3e50',
  KANBAN_HEADER: '#34495e',
  NOTE_STANDARD: '#f1c40f',
  NOTE_RUSH: '#e74c3c',
  NOTE_DONE: '#2ecc71',
  CLAW_ARM: '#7f8c8d',
  JANITOR_BIN: '#2980b9'
};

export const EARNINGS_PER_PAPER = 0.045;
export const MAX_RACK_CAPACITY = 8;