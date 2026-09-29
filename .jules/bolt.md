## 2024-05-18 - Memoize components to prevent re-renders
**Learning:** Component `SkillCard` and `FilterModal` inside `LibraryClient` rerendered excessively when the search input changed.
**Action:** Always consider wrapping map-generated functional components and deeply nested layout elements with `React.memo` especially when their props remain relatively static compared to their parent container's state. Also ensure that callback functions passed as props to these components are wrapped in `useCallback`.
