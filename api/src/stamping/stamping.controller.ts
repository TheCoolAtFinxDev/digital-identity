import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermission } from '../iam/permission.decorator';
import { CreateStampDto } from './dto/create-stamp.dto';
import { StampQueryDto } from './dto/stamp-query.dto';
import { MAX_STAMP_FILE_BYTES } from './stamp-storage.service';
import { StampingService } from './stamping.service';

@ApiTags('stamping')
@ApiBearerAuth()
@Controller('v1/stamps')
export class StampingController {
  constructor(private readonly svc: StampingService) {}

  @RequirePermission('stamp:create')
  @ApiOperation({
    summary: 'Stamp a document (visible seal + QR, then HSM signature)',
    description:
      'Renders the visible stamp onto the PDF and signs the rendered bytes, so the file the recipient receives is exactly what was signed. Non-PDF uploads are signed without a visible layer.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse()
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_STAMP_FILE_BYTES },
    }),
  )
  stamp(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateStampDto,
    @Request() req: any,
  ) {
    return this.svc.stamp(file, dto, req.user?.userId);
  }

  @RequirePermission('stamp:read')
  @ApiOperation({ summary: 'List stamped documents' })
  @ApiOkResponse()
  @Get()
  list(@Query() query: StampQueryDto) {
    return this.svc.listStamps(query);
  }

  @RequirePermission('stamp:read')
  @ApiOperation({ summary: 'Get a stamp record' })
  @ApiOkResponse()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getStamp(id);
  }

  @RequirePermission('stamp:read')
  @ApiOperation({ summary: 'Download the stamped document' })
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.svc.downloadStamp(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  @RequirePermission('stamp:read')
  @ApiOperation({ summary: 'QR code PNG for the stamp verification URL' })
  @Header('Content-Type', 'image/png')
  @Get(':id/qr.png')
  async qr(@Param('id') id: string, @Res() res: Response) {
    const png = await this.svc.qrPng(id);
    res.setHeader('Content-Type', 'image/png');
    res.end(png);
  }
}
