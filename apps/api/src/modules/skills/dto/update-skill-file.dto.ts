import { PartialType } from '@nestjs/swagger'
import { CreateSkillFileDto } from './create-skill-file.dto'

export class UpdateSkillFileDto extends PartialType(CreateSkillFileDto) {}
