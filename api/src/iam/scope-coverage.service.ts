import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './permission.decorator';
import { SCOPE_KEY, ScopeDeclaration } from './scope.decorator';

/**
 * Refuses to start if any permission-guarded route has not declared what it acts
 * on.
 *
 * This is the whole reason the declaration can be trusted. A guard that silently
 * falls back to a global-only check when a route forgets to declare its scope
 * looks like it works — every existing route keeps passing — while quietly
 * making narrow role assignments meaningless on exactly the routes someone
 * forgot. Failing at boot turns that from a security hole discovered in
 * production into a deploy that does not happen.
 *
 * Adding a guarded route therefore forces a decision: name the resource it acts
 * on, or state with @GlobalScope() that the permission is not narrowable.
 */
@Injectable()
export class ScopeCoverageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScopeCoverageService.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap() {
    const undeclared: string[] = [];
    let guarded = 0;
    let narrowable = 0;

    for (const wrapper of this.discovery.getControllers()) {
      const { instance } = wrapper;
      if (!instance || !Object.getPrototypeOf(instance)) continue;

      const controllerName = wrapper.metatype?.name ?? 'UnknownController';
      const prototype = Object.getPrototypeOf(instance);

      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;

        const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
          handler,
          instance.constructor,
        ]);
        if (!permission) continue;
        guarded++;

        const declared = this.reflector.getAllAndOverride<
          ScopeDeclaration | ScopeDeclaration[]
        >(SCOPE_KEY, [handler, instance.constructor]);

        if (!declared) {
          undeclared.push(`${controllerName}.${methodName} (${permission})`);
        } else if (
          (Array.isArray(declared) ? declared : [declared]).some((d) => d.target !== 'GLOBAL')
        ) {
          narrowable++;
        }
      }
    }

    if (undeclared.length) {
      throw new Error(
        `${undeclared.length} permission-guarded route(s) do not declare their scope. ` +
          'Add @ScopedTo({...}) for the resource the route acts on, or @GlobalScope() ' +
          'if the permission is only ever held organisation-wide:\n  ' +
          undeclared.join('\n  '),
      );
    }

    this.logger.log(
      `Scope coverage: ${guarded} guarded route(s), ${narrowable} narrowable by a scoped role`,
    );
  }
}
