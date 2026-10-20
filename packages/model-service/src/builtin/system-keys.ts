/**
 * 系统模型 API Key 占位（平台内置模型直连用）
 *
 * 「系统模型」指平台方提供、由平台 Key 付费的模型（区别于用户在模型设置页
 * 填自己 Key 的自定义模型）。用户在前端直接选择厂商与模型名即可使用，
 * 无需配置任何 Key；调用按内置模型同样消耗积分。
 *
 * TODO（平台方填写）：将各厂商的 API Key 填入下方对应字段即可启用系统模型。
 * - 留空（''）表示该厂商未启用系统直连，用户选择时会得到明确报错
 * - Key 仅存在于服务端（model-service 包），不会进入前端产物
 */
export const SYSTEM_MODEL_KEYS: Record<string, string> = {
  openai: '',
  deepseek: '',
  qwen: '',
  glm: '',
}
