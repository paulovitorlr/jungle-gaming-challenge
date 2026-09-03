import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

export abstract class ProviderIdentityPort {
  abstract providerId(context: ExecutionContext): string | undefined;
}

@Injectable()
export class NoopProviderIdentityAdapter implements ProviderIdentityPort {
  providerId(): string | undefined {
    return undefined;
  }
}

@Injectable()
export class NoopAuthGuard implements CanActivate {
  constructor(private readonly identities: ProviderIdentityPort) {}

  canActivate(context: ExecutionContext): boolean {
    this.identities.providerId(context);
    return true;
  }
}
