import { cp, mkdir } from 'node:fs/promises'

const destination = new URL('../server-dist/server/migrations/', import.meta.url)
await mkdir(destination, { recursive: true })
await cp(new URL('../server/migrations/', import.meta.url), destination, { recursive: true })
