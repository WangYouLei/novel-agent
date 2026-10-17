import { describe, expect, it, vi } from 'vitest'
import { type ArgumentsHost, HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import { BizError, ErrorCode } from '@novelagent/shared'
import { BizErrorFilter } from './biz-error.filter'

/**
 * 全局异常过滤器单测（批次 8.1，评审 L3）：
 * - 500 级业务错误（INTERNAL_ERROR）→ HTTP 500（客户端与监控可区分）
 * - 4xx 业务码透传；1xxx/2xxx 业务码维持原有 HTTP 400 映射
 * - 非 BizError 未知异常 → 兜底 HTTP 500 + INTERNAL_ERROR 响应体
 * - 响应体保持统一 ApiResponse 结构（code/message/data）
 * 直接实例化 filter 调用 catch()，Mock 最小 ArgumentsHost（仅 switchToHttp().getResponse()）
 */

/** 构造最小 mock 宿主：捕获 response.status(...).json(...) 两步调用 */
function makeHost() {
  const json = vi.fn()
  const response = { status: vi.fn().mockReturnValue({ json }) }
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost
  return { host, json, status: response.status }
}

describe('BizErrorFilter', () => {
  it('500 级业务错误（INTERNAL_ERROR）→ HTTP 500，响应体结构不变', () => {
    const filter = new BizErrorFilter()
    const { host, json, status } = makeHost()
    filter.catch(new BizError(ErrorCode.INTERNAL_ERROR, '服务器内部错误'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({
      code: ErrorCode.INTERNAL_ERROR,
      message: '服务器内部错误',
      data: null,
    })
  })

  it('1xxx 业务码（积分不足）→ 维持现状 HTTP 400，业务码原样保留', () => {
    const filter = new BizErrorFilter()
    const { host, json, status } = makeHost()
    filter.catch(new BizError(ErrorCode.INSUFFICIENT_CREDITS, '积分不足'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith({
      code: ErrorCode.INSUFFICIENT_CREDITS,
      message: '积分不足',
      data: null,
    })
  })

  it('2xxx 业务码（缺少模型提供者）→ 维持现状 HTTP 400', () => {
    const filter = new BizErrorFilter()
    const { host, status } = makeHost()
    filter.catch(new BizError(ErrorCode.MODEL_PROVIDER_MISSING, '缺少模型提供者'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
  })

  it('4xx 业务码（BAD_REQUEST=400）→ HTTP 状态与业务码一致', () => {
    const filter = new BizErrorFilter()
    const { host, status } = makeHost()
    filter.catch(new BizError(ErrorCode.BAD_REQUEST, '参数错误'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
  })

  it('非 BizError 未知异常 → 兜底 HTTP 500 + INTERNAL_ERROR 响应体（不泄漏堆栈）', () => {
    const filter = new BizErrorFilter()
    const { host, json, status } = makeHost()
    filter.catch(new Error('boom'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({
      code: ErrorCode.INTERNAL_ERROR,
      message: '服务器内部错误，请查看日志',
      data: null,
    })
  })

  it('HttpException（404）→ 透传其状态码', () => {
    const filter = new BizErrorFilter()
    const { host, json, status } = makeHost()
    const exception: HttpException = new NotFoundException('不存在')
    filter.catch(exception, host)
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
    expect(json).toHaveBeenCalledWith({ code: HttpStatus.NOT_FOUND, message: '不存在', data: null })
  })
})
