import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsIn, IsOptional } from 'class-validator';
import { HandoffService } from './handoff.service';

class ListHandoffQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ASSUMED', 'RETURNED_TO_AI', 'CLOSED'])
  status?: 'PENDING' | 'ASSUMED' | 'RETURNED_TO_AI' | 'CLOSED';
}

@Controller('handoff')
export class HandoffController {
  constructor(private readonly handoff: HandoffService) {}

  @Get('queue')
  async queue(@Query() query: ListHandoffQueryDto) {
    return this.handoff.listQueue(query.status ?? 'PENDING');
  }

  @Post(':id/assume')
  async assume(@Param('id') id: string, @Req() req: Request) {
    return this.handoff.assume(id, req.user!.userId);
  }

  @Post(':id/return')
  async returnToAI(@Param('id') id: string, @Req() req: Request) {
    return this.handoff.returnToAI(id, req.user!.userId);
  }
}
