// Loads the Rust engine (WebAssembly) and calls it with JSON.
// Protocol: see engine/src/wasm.rs.

import wasmUrl from './wasm/sootsayer_engine.wasm?url';
import type {
  BriefInput,
  BriefOutput,
  CleanAirInput,
  CleanAirOutput,
  FireCountOutput,
  LocateOutput,
  OutlookInput,
  OutlookOutput,
} from './types';

interface EngineExports {
  memory: WebAssembly.Memory;
  ss_alloc(len: number): number;
  ss_free(ptr: number, len: number): void;
  ss_outlook(ptr: number, len: number): number;
  ss_clean_air(ptr: number, len: number): number;
  ss_fire_counts(ptr: number, len: number): number;
  ss_locate(ptr: number, len: number): number;
  ss_brief(ptr: number, len: number): number;
}

type Entry = 'ss_outlook' | 'ss_clean_air' | 'ss_fire_counts' | 'ss_locate' | 'ss_brief';

export class EngineError extends Error {}

let exportsRef: EngineExports | null = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function loadEngine(): Promise<void> {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`engine.wasm HTTP ${response.status}`);
  let instance: WebAssembly.Instance;
  try {
    ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), {}));
  } catch {
    // Some servers send the wrong MIME type; fall back to bytes.
    ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
  }
  exportsRef = instance.exports as unknown as EngineExports;
}

function call<T>(entry: Entry, input: unknown): T {
  const ex = exportsRef;
  if (!ex) throw new EngineError('engine not loaded');
  const bytes = encoder.encode(JSON.stringify(input));
  const ptr = ex.ss_alloc(bytes.length);
  new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
  const res = ex[entry](ptr, bytes.length);
  // Re-create views after the call: linear memory may have grown.
  const len = new DataView(ex.memory.buffer).getUint32(res, true);
  const text = decoder.decode(new Uint8Array(ex.memory.buffer, res + 4, len));
  ex.ss_free(res, len + 4);
  ex.ss_free(ptr, bytes.length);
  const envelope = JSON.parse(text) as { ok: boolean; result?: T; error?: string };
  if (!envelope.ok || envelope.result === undefined) throw new EngineError(envelope.error ?? 'engine error');
  return envelope.result;
}

type Shapes = { code: string; multipolygon: number[][][][] }[];

export const engine = {
  outlook: (input: OutlookInput) => call<OutlookOutput>('ss_outlook', input),
  cleanAir: (input: CleanAirInput) => call<CleanAirOutput>('ss_clean_air', input),
  fireCounts: (input: { days: string[]; districts: Shapes; fires: [number, number, string][] }) =>
    call<FireCountOutput>('ss_fire_counts', input),
  locate: (input: { districts: Shapes; points: [number, number][] }) => call<LocateOutput>('ss_locate', input),
  brief: (input: BriefInput) => call<BriefOutput>('ss_brief', input),
};
