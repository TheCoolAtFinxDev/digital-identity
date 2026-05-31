import { Module } from '@nestjs/common';
import { ObjectController } from './object.controller';
import { ObjectService } from './object.service';

@Module({
  controllers: [ObjectController],
  providers: [ObjectService],
})
export class ObjectModule {}
