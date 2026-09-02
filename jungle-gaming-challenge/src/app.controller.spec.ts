import {
  Test,
  type TestingModule,
} from '@nestjs/testing';

import { AppController } from './app.controller.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule =
      await Test.createTestingModule({
        controllers: [AppController],
      }).compile();

    appController =
      app.get<AppController>(AppController);
  });

  it('should return health status', () => {
    expect(appController.health()).toEqual({
      status: 'ok',
    });
  });
});