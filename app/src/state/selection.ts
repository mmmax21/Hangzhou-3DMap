import { create } from 'zustand'
import type { Landmark } from '../data/loaders'
type Selection = { selected: Landmark | null; select: (item: Landmark | null) => void }
export const useSelection = create<Selection>((set) => ({ selected: null, select: (selected) => set({ selected }) }))
