import { create } from 'zustand';

interface LayoutState {
  isSearchInHeader: boolean;
  setIsSearchInHeader: (value: boolean) => void;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  activeSourceTab: 'youtube' | 'github' | 'google_search';
  setActiveSourceTab: (value: 'youtube' | 'github' | 'google_search') => void;
}

export const useLayoutState = create<LayoutState>((set) => ({
  isSearchInHeader: false,
  setIsSearchInHeader: (value) => set({ isSearchInHeader: value }),
  activeFilter: 'All',
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  activeSourceTab: 'youtube',
  setActiveSourceTab: (value) => set({ activeSourceTab: value }),
}));
