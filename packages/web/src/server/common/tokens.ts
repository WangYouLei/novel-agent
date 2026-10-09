/** AppConfig 注入 token（独立文件避免 services.module ↔ cordis.host 循环导入） */
export const APP_CONFIG = Symbol('APP_CONFIG')

/** PrismaClient 注入 token */
export const PRISMA = Symbol('PRISMA')
