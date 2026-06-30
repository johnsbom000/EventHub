export {};

declare global {
  interface Window {
    /** Meta Pixel (Facebook Pixel) command queue. Defined by metaPixel.ts. */
    fbq?: (...args: any[]) => void;
    /** Internal Meta Pixel reference set by the official loader snippet. */
    _fbq?: unknown;
  }
}
