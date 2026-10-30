import 'dotenv/config'
import { z } from 'zod'

export function parseAllowedOrigins(rawOrigins: string): string[] {
  return [...new Set(rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin))]
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string = config.CLIENT_ORIGIN): boolean {
  if (!origin) return false
  try {
    const requestOrigin = new URL(origin).origin
    const configuredOrigins = parseAllowedOrigins(allowedOrigins)
    if (configuredOrigins.includes(requestOrigin)) return true

    const requestHost = new URL(origin).hostname
    const requestPort = new URL(origin).port
    const requestProtocol = new URL(origin).protocol

    return configuredOrigins.some((configuredOrigin) => {
      const configuredUrl = new URL(configuredOrigin)
      const configuredHost = configuredUrl.hostname
      const configuredPort = configuredUrl.port
      const configuredProtocol = configuredUrl.protocol

      const sameLoopbackAlias = (requestHost === 'localhost' && (configuredHost === '127.0.0.1' || configuredHost === '::1'))
        || ((requestHost === '127.0.0.1' || requestHost === '::1') && configuredHost === 'localhost')
      return configuredProtocol === requestProtocol
        && configuredPort === requestPort
        && sameLoopbackAlias
    })
  } catch {
    return false
  }
}

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z.string().regex(/^[a-zA-Z0-9_]+$/).default('maxaka'),
  MYSQL_USER: z.string().min(1).default('root'),
  MYSQL_PASSWORD: z.string().min(1),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  MYSQL_QUEUE_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
  REDIS_URL: z.string().default(''),
  INSTANCE_PUBLIC_URL: z.string().default(''),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  HOST_RECONNECT_GRACE_MS: z.coerce.number().int().min(1000).max(300000).default(20000),
  MEDIA_TURN_URLS: z.string().default(''),
  MEDIA_TURN_SHARED_SECRET: z.string().default(''),
})

const parsedEnvironment = environmentSchema.safeParse(process.env)

if (!parsedEnvironment.success) {
  console.error('A configuração do servidor é inválida:', parsedEnvironment.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  throw new Error('Preencha a configuração do servidor a partir de .env.example.')
}

export const config = parsedEnvironment.data

if (config.REDIS_URL && !/^rediss?:\/\/.+$/u.test(config.REDIS_URL)) {
  throw new Error('REDIS_URL deve começar por redis:// ou rediss://.')
}

if (config.REDIS_URL && !z.string().url().safeParse(config.INSTANCE_PUBLIC_URL).success) {
  throw new Error('INSTANCE_PUBLIC_URL tem de ser o endereço público desta instância quando Redis está configurado.')
}

if (config.MEDIA_TURN_URLS) {
  const turnUrls = config.MEDIA_TURN_URLS.split(',').map((url) => url.trim())
  if (turnUrls.some((url) => !/^(turn|turns):\S+$/u.test(url))) {
    throw new Error('MEDIA_TURN_URLS deve conter URLs turn: ou turns: separadas por vírgulas.')
  }
  if (!config.MEDIA_TURN_SHARED_SECRET) {
    throw new Error('Configura MEDIA_TURN_SHARED_SECRET quando definires MEDIA_TURN_URLS.')
  }
}
