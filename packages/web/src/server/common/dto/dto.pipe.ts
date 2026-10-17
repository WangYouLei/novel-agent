import 'reflect-metadata'
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { validate } from 'class-validator'
import { plainToInstance, type ClassConstructor } from 'class-transformer'

/**
 * 显式 DTO 校验管道：@Body(new BodyDtoPipe(XxxDto)) body: XxxDto
 *
 * 为什么不用全局 ValidationPipe：dev 启动链为 tsx（esbuild 系，见 apps/launcher 的
 * dev 脚本），esbuild 转换不生成 design:paramtypes 元数据，全局管道拿不到 metatype
 * 会静默跳过校验。显式传入 DTO class 可保证 dev 与 prod 校验行为一致。
 */
@Injectable()
export class BodyDtoPipe implements PipeTransform {
  constructor(private readonly dtoClass: ClassConstructor<object>) {}

  async transform(value: unknown) {
    if (typeof value !== 'object' || value === null) {
      throw new BadRequestException('请求体必须是 JSON 对象')
    }
    const errors = await validate(plainToInstance(this.dtoClass, value))
    if (errors.length > 0) {
      throw new BadRequestException(
        `参数校验失败：${errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join('; ')}`,
      )
    }
    return value
  }
}
