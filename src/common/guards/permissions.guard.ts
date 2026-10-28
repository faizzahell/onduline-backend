import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RbacService } from '../../modules/rbac/rbac.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Checks the `@Permissions()` metadata on both the handler and the controller.
 *
 * Must be applied after `JwtAuthGuard` because it relies on `request.user`.
 * If a handler declares no permissions at all, the guard lets the request
 * through and authentication alone applies.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    const user = request.user;

    if (!user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }

    const allowed = await this.rbacService.hasAnyPermission(
      user.id,
      requiredPermissions,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Permission denied, one of the following is required: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
