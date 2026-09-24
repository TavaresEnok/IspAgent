import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsIn, IsOptional } from 'class-validator';
import { HandoffService } from './handoff.service';
import { Roles } from '../common/decorators/roles.decorator';

class ListHandoffQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ASSUMED', 'RETURNED_TO_AI', 'CLOSED'])
  status?: 'PENDING' | 'ASSUMED' | 'RETURNED_TO_AI' | 'CLOSED';

  @IsOptional()
  department?: string;
}

@Controller('handoff')
export class HandoffController {
  constructor(private readonly handoff: HandoffService) {}

  @Get('queue')
  @Roles('ANALYST')
  async queue(@Query() query: ListHandoffQueryDto) {
    return this.handoff.listQueue(query.status ?? 'PENDING', query.department);
  }

  @Post(':id/assume')
  @Roles('AGENT')
  async assume(@Param('id') id: string, @Req() req: Request) {
    return this.handoff.assume(id, req.user!.userId);
  }

  @Post(':id/return')
  @Roles('AGENT')
  async returnToAI(@Param('id') id: string, @Req() req: Request) {
    return this.handoff.returnToAI(id, req.user!.userId, req.user!.role);
  }
}
