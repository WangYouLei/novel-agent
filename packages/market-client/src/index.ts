export type { PluginManifest } from './manifest'
export { KERNEL_SERVICES } from './manifest'
export { scanLocalRepo, readManifest } from './local-repo'
export { resolveDependencies, checkOptionalDependencies } from './dependency'
export type { ResolveResult, SkippedPlugin } from './dependency'
export {
  syncBuiltinPlugins,
  ensureSharedDependencies,
  resolvePackageDir,
  installPluginFromDirectory,
  installPluginFromZip,
  uninstallPlugin,
  readInstallSource,
} from './installer'
export type { SyncResult, PluginInstallSource } from './installer'
export { unzipToDir, zipDirectory, findPluginRootDir } from './zip'
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
export { HttpMarketplaceClient } from './http-client'
export type { HttpMarketplaceOptions } from './http-client'
