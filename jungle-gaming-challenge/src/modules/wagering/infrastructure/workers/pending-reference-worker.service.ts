import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReprocessPendingReferencesUseCase } from '../../application/use-cases/reprocess-pending-references.use-case.js';

@Injectable()
export class PendingReferenceWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PendingReferenceWorkerService.name);
  private stopping = false;
  private loop?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly reprocess: ReprocessPendingReferencesUseCase,
  ) {}

  onModuleInit(): void {
    if (
      this.config.get<string>('PENDING_REFERENCE_WORKER_ENABLED') === 'false'
    ) {
      return;
    }
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  private async run(): Promise<void> {
    const pollMs = this.read('PENDING_REFERENCE_POLL_INTERVAL_MS', 1_000);
    const batchSize = this.read('PENDING_REFERENCE_BATCH_SIZE', 10);
    const leaseDurationMs = this.read(
      'PENDING_REFERENCE_LEASE_DURATION_MS',
      60_000,
    );

    while (!this.stopping) {
      try {
        const result = await this.reprocess.execute({
          batchSize,
          leaseDurationMs,
        });
        if (result.claimed > 0) {
          this.logger.log(
            JSON.stringify({ event: 'pending_reference_batch', ...result }),
          );
        }
        if (result.claimed === 0) await this.delay(pollMs);
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'pending_reference_worker_failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
        await this.delay(pollMs);
      }
    }
  }

  private read(name: string, fallback: number): number {
    const value = Number(this.config.get<string>(name));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
