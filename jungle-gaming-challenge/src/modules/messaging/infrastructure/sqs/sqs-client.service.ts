import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';

@Injectable()
export class SqsClientService
  implements OnModuleDestroy
{
  readonly client: SQSClient;

  constructor(
    configService: ConfigService,
  ) {
    this.client = new SQSClient({
      region:
        configService.getOrThrow<string>(
          'AWS_REGION',
        ),

      endpoint:
        configService.getOrThrow<string>(
          'SQS_ENDPOINT',
        ),

      credentials: {
        accessKeyId:
          configService.getOrThrow<string>(
            'AWS_ACCESS_KEY_ID',
          ),

        secretAccessKey:
          configService.getOrThrow<string>(
            'AWS_SECRET_ACCESS_KEY',
          ),
      },
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}