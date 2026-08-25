import { Global, Module } from '@nestjs/common';
import { DiscoveryModule, MetadataScanner } from '@nestjs/core';
import { IamService } from './iam.service';
import { ScopeCoverageService } from './scope-coverage.service';
import { ScopeResolverService } from './scope-resolver.service';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [IamService, ScopeResolverService, MetadataScanner, ScopeCoverageService],
  exports: [IamService, ScopeResolverService],
})
export class IamModule {}
