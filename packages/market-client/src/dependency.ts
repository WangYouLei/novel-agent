import semver from 'semver'
import type { PluginManifest } from './manifest'
import { KERNEL_SERVICES } from './manifest'

/**
 * 依赖解析（文档 6.4）：
 * - 依赖目标 = 内核服务（白名单，恒满足）或已安装插件的 pluginId
 * - 必需依赖缺失 → 跳过加载并记录（UI 提示，PRD 5.4）
 * - 可选依赖缺失 → 正常加载（功能受限）
 * - 输出拓扑加载顺序（被依赖者先加载）
 */
export interface ResolveResult {
  /** 按依赖顺序可加载的插件 */
  loadOrder: PluginManifest[]
  /** 因依赖缺失被跳过的插件（含缺失描述，供 UI 展示） */
  skipped: SkippedPlugin[]
  /** 依赖成环等无法排序时直接放弃的插件 */
  cyclic: PluginManifest[]
}

export interface SkippedPlugin {
  manifest: PluginManifest
  missing: string[]
}

export function resolveDependencies(manifests: PluginManifest[]): ResolveResult {
  const byId = new Map(manifests.map((m) => [m.pluginId, m]))

  // 第一轮：检查必需依赖是否可满足（依赖目标存在性）
  const available = new Set<string>(KERNEL_SERVICES)
  const skipped: SkippedPlugin[] = []
  const candidates: PluginManifest[] = []

  for (const m of manifests) {
    const missing: string[] = []
    for (const [dep, range] of Object.entries(m.dependencies ?? {})) {
      if (!isDependencySatisfied(dep, range, byId)) {
        missing.push(`${dep}@${range}`)
      }
    }
    if (missing.length > 0) {
      skipped.push({ manifest: m, missing })
    } else {
      available.add(m.pluginId)
      candidates.push(m)
    }
  }

  // 级联：被跳过的插件自身也作为依赖目标失效（重新检查一轮直至稳定）
  let changed = true
  while (changed) {
    changed = false
    for (let i = candidates.length - 1; i >= 0; i--) {
      const m = candidates[i]
      const ok = Object.entries(m.dependencies ?? {}).every(
        ([dep, range]) =>
          (KERNEL_SERVICES as readonly string[]).includes(dep) ||
          (available.has(dep) && isVersionOk(byId.get(dep)!.version, range)),
      )
      if (!ok) {
        candidates.splice(i, 1)
        available.delete(m.pluginId)
        skipped.push({
          manifest: m,
          missing: ['（因上游依赖缺失而级联不可用）'],
        })
        changed = true
      }
    }
  }

  // 拓扑排序（Kahn）：只考虑候选插件之间的依赖边
  const loadOrder: PluginManifest[] = []
  const cyclic: PluginManifest[] = []
  const pending = [...candidates]
  while (pending.length > 0) {
    const index = pending.findIndex((m) =>
      Object.keys(m.dependencies ?? {}).every(
        (dep) =>
          (KERNEL_SERVICES as readonly string[]).includes(dep) ||
          !byId.has(dep) || // 依赖的是系统服务或外部能力
          loadOrder.some((loaded) => loaded.pluginId === dep),
      ),
    )
    if (index === -1) {
      // 剩余全部成环
      cyclic.push(...pending)
      break
    }
    loadOrder.push(pending.splice(index, 1)[0])
  }

  return { loadOrder, skipped, cyclic }
}

/** 可选依赖检查：返回确实缺失的可选依赖描述（仅提示用，不阻断加载） */
export function checkOptionalDependencies(
  manifest: PluginManifest,
  loadedIds: Set<string>,
): string[] {
  const missing: string[] = []
  for (const [dep, range] of Object.entries(manifest.optionalDependencies ?? {})) {
    if ((KERNEL_SERVICES as readonly string[]).includes(dep)) continue
    const target = loadedIds.has(dep)
    if (!target) missing.push(`${dep}@${range}`)
  }
  return missing
}

function isDependencySatisfied(dep: string, range: string, byId: Map<string, PluginManifest>): boolean {
  if ((KERNEL_SERVICES as readonly string[]).includes(dep)) return true
  const target = byId.get(dep)
  if (!target) return false
  return isVersionOk(target.version, range)
}

function isVersionOk(version: string, range: string): boolean {
  // 非法 range 按宽松处理（文档 6.4：npm semver 语法）
  return range === '*' || semver.satisfies(version, range, { includePrerelease: true })
}
