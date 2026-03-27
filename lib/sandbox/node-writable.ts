import { createRequire } from 'node:module'

type WritableConstructor = new (options?: import('node:stream').WritableOptions) => import('node:stream').Writable

/**
 * Next.js (especially Turbopack) can bundle dynamic `import('node:stream')` in a way
 * where `Writable` is not a constructor. Loading via createRequire always resolves
 * the real Node builtin at runtime.
 */
let cachedWritable: WritableConstructor | null = null

export function getNodeWritableClass(): WritableConstructor {
  if (cachedWritable) {
    return cachedWritable
  }
  const require = createRequire(import.meta.url)
  const mod = require('node:stream') as typeof import('node:stream')
  const Ctor = mod.Writable as WritableConstructor
  if (typeof Ctor !== 'function') {
    throw new Error('Node Writable is not available')
  }
  cachedWritable = Ctor
  return Ctor
}
