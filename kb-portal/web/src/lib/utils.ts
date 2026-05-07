/**
 * Utility functions for class name merging and style handling
 * Compatible with Ant Design and CSS custom properties approach
 */

/**
 * Merges class names, filtering out falsy values
 * Similar to clsx but simpler
 */
export function cn(...classes: (string | boolean | undefined | null | number)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Merges inline styles with precedence handling
 */
export function mergeStyles(
  base: React.CSSProperties = {},
  ...overrides: (React.CSSProperties | undefined)[]
): React.CSSProperties {
  return Object.assign({}, base, ...overrides);
}

/**
 * Creates a style object from CSS variable
 */
export function cssVar(name: string): string {
  return `var(${name})`;
}

/**
 * Generates a consistent hash for deterministic styling
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
