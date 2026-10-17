import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { plainToInstance, type ClassConstructor } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { LoginRequestDto, RegisterRequestDto } from './auth.dto'
import { CreateNovelRequestDto } from './novel.dto'
import { SendChatMessageRequestDto } from './chat.dto'
import { BodyDtoPipe } from './dto.pipe'

/** 校验 plain 对象是否满足 DTO 约束，返回错误列表（空数组 = 通过） */
function validateDto(dtoClass: ClassConstructor<object>, value: object) {
  return validate(plainToInstance(dtoClass, value))
}

describe('认证 DTO', () => {
  it('LoginRequestDto 缺必填字段 → 有错误', async () => {
    expect((await validateDto(LoginRequestDto, { password: 'secret1' })).length).toBeGreaterThan(0)
    expect((await validateDto(LoginRequestDto, {})).length).toBeGreaterThan(0)
  })

  it('LoginRequestDto 字段类型不符（username 传数字）→ 有错误', async () => {
    const errors = await validateDto(LoginRequestDto, { username: 12345, password: 'secret1' })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('LoginRequestDto 密码为空串 → 有错误', async () => {
    const errors = await validateDto(LoginRequestDto, { username: 'alice', password: '' })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('LoginRequestDto 合法 → 无错误', async () => {
    const errors = await validateDto(LoginRequestDto, { username: 'alice', password: 'secret1' })
    expect(errors).toEqual([])
  })

  it('RegisterRequestDto 合法 → 无错误；密码过短 → 有错误', async () => {
    expect(await validateDto(RegisterRequestDto, { username: 'bob', password: 'secret1' })).toEqual([])
    const errors = await validateDto(RegisterRequestDto, { username: 'bob', password: '123' })
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe('小说 DTO', () => {
  it('CreateNovelRequestDto 缺 title → 有错误', async () => {
    const errors = await validateDto(CreateNovelRequestDto, { description: '简介' })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('CreateNovelRequestDto title 类型不符 → 有错误', async () => {
    const errors = await validateDto(CreateNovelRequestDto, { title: 100 })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('CreateNovelRequestDto 合法（含可选字段）→ 无错误', async () => {
    const errors = await validateDto(CreateNovelRequestDto, {
      title: '我的小说',
      description: '简介',
      genre: '玄幻',
      stylePackId: 'pack-1',
    })
    expect(errors).toEqual([])
  })
})

describe('对话 DTO', () => {
  it('SendChatMessageRequestDto 缺 content → 有错误', async () => {
    const errors = await validateDto(SendChatMessageRequestDto, {})
    expect(errors.length).toBeGreaterThan(0)
  })

  it('SendChatMessageRequestDto content 类型不符 → 有错误', async () => {
    const errors = await validateDto(SendChatMessageRequestDto, { content: 12345 })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('SendChatMessageRequestDto 合法（含可选字段与嵌套 attachment）→ 无错误', async () => {
    const errors = await validateDto(SendChatMessageRequestDto, {
      content: '帮我生成大纲',
      providerId: 'builtin',
      attachment: { name: '素材.txt', text: '正文' },
    })
    expect(errors).toEqual([])
  })
})

describe('BodyDtoPipe', () => {
  it('请求体非对象 → 抛 BadRequestException', async () => {
    const pipe = new BodyDtoPipe(LoginRequestDto)
    await expect(pipe.transform(null)).rejects.toThrow(BadRequestException)
    await expect(pipe.transform('xxx')).rejects.toThrow('请求体必须是 JSON 对象')
  })

  it('非法字段值 → 抛 BadRequestException（含校验失败原因）', async () => {
    const pipe = new BodyDtoPipe(LoginRequestDto)
    await expect(pipe.transform({ username: 12345, password: 'secret1' })).rejects.toThrow(
      '参数校验失败',
    )
  })

  it('合法请求体 → 原样返回', async () => {
    const pipe = new BodyDtoPipe(LoginRequestDto)
    const value = { username: 'alice', password: 'secret1' }
    await expect(pipe.transform(value)).resolves.toBe(value)
  })
})
