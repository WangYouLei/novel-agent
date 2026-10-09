export type { PluginManifest } from './manifest'
export { KERNEL_SERVICES } from './manifest'
export { scanLocalRepo, readManifest } from './local-repo'
export { resolveDependencies, checkOptionalDependencies } from './dependency'
export type { ResolveResult, SkippedPlugin } from './dependency'
export { syncBuiltinPlugins, ensureSharedDependencies, resolvePackageDir } from './installer'
export type { SyncResult } from './installer'
export {
  MockMarketplaceClient,
  type MarketplaceClient,
  type PluginSummary,
  type PluginDetail,
  type PluginVersion,
  type PluginUpdate,
  type PluginCategory,
  type Page,
} from './remote-api'
