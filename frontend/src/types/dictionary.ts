import type en from '@/dictionaries/en.json';

/**
 * Shape of a translation dictionary, derived from the English one.
 * `en.json` is the reference — every other locale must match its keys.
 *
 * Type-only import, so no JSON is bundled into client components that use it.
 */
export type Dictionary = typeof en;

export type CarouselDictionary = Dictionary['carousel'];
export type CarouselSlideCopy = CarouselDictionary['slides'][number];
