export const PENNY_EDGE_PIVOT_TRAPS: ReadonlySet<string> = new Set([
  'spike_trap_floor_base',
  'spike_trap_spikes',
  'electric_ceiling_trap',
  's_ceiling_electric_weak_trap',
  's_cieling_drop_trap',
  's_railrotate_a',
  's_railrotate_b',
  'ceiling_gas_trap',
  's_ceiling_spikes_metal_base',
  's_cieling_spikes_metal',
  's_floor_freeze',
  's_speedboost_straight',
  'enemy_jumppad_floor',
  's_floor_jump_trap_base',
  's_wood_floor_spike',
  'sm_tar_pit_trap',
  'sm_tartrap_plane',
]);
export function pennyTrapPivotOffset(meshStem: string): readonly [number, number, number] {
  return PENNY_EDGE_PIVOT_TRAPS.has(meshStem.toLowerCase()) ? [0.5, 0, 0] : [0, 0, 0];
}
