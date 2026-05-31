import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ObjectService } from './object.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { ObjectPageDto, ObjectQueryDto, ObjectResponseDto } from './dto/object-response.dto';

@ApiBearerAuth()
@ApiTags('objects')
@Controller('v1/objects')
export class ObjectController {
  constructor(private readonly svc: ObjectService) {}

  @ApiOperation({ summary: 'List digital object records (paginated)' })
  @ApiOkResponse({ type: ObjectPageDto })
  @Get()
  listObjects(@Query() q: ObjectQueryDto) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10) || 20));
    return this.svc.listObjects(page, limit, q.entityId, q.objectType);
  }

  @ApiOperation({ summary: 'Register a new digital object record' })
  @ApiCreatedResponse({ type: ObjectResponseDto })
  @Post()
  createObject(@Body() dto: CreateObjectDto, @Request() req: any) {
    return this.svc.createObject(dto, req.user?.userId);
  }

  @ApiOperation({ summary: 'Get a digital object record by ID' })
  @ApiOkResponse({ type: ObjectResponseDto })
  @Get(':id')
  getObject(@Param('id') id: string, @Request() req: any) {
    return this.svc.getObject(id, req.user?.userId);
  }
}
