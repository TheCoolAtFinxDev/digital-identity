import { Module } from '@nestjs/common';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';

@Module({
  controllers: [SigningController],
  providers: [SigningService],
})
export class SigningModule {}
