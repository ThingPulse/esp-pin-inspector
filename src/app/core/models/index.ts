export interface ChipViewBox {
  width: number;
  height: number;
}

export interface PinFunction {
  kind: string;
  role?: string;
  notes?: string;
}

export type ReservedLevel = 'info' | 'warn' | 'error';

export interface ReservedInfo {
  level: ReservedLevel;
  tags?: string[];
  reason?: string;
}

export interface PinPosition {
  x: number;
  y: number;
}

export interface PinArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElectricalInfo {
  type: string;
  voltage?: string;
}

export interface PinDefinition {
  id: string;
  number: string;
  name: string;
  position: PinPosition;
  functions: PinFunction[];
  reserved?: ReservedInfo;
  area?: PinArea;
  electrical?: ElectricalInfo;
}

export interface ChipDefinition {
  chipId: string;
  name: string;
  package: string;
  datasheetUrl?: string;
  image: string;
  viewBox: ChipViewBox;
  pins: PinDefinition[];
}

