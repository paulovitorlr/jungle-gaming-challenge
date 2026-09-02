import { InboxMessage } from './inbox-message.js';

describe('InboxMessage', () => {
  const receivedAt =
    new Date('2026-09-02T12:00:00.000Z');

  it('should receive an inbox message', () => {
    const message = InboxMessage.receive({
      messageId: 'message-123',
      consumerName: 'wager-transaction-consumer',
      payloadHash: 'payload-hash',
      receivedAt,
    });

    expect(message.messageId).toBe('message-123');
    expect(message.consumerName).toBe(
      'wager-transaction-consumer',
    );
    expect(message.payloadHash).toBe('payload-hash');
    expect(message.receivedAt).toEqual(receivedAt);
    expect(message.processedAt).toBeUndefined();
    expect(message.isProcessed()).toBe(false);
  });

  it('should mark the message as processed', () => {
    const message = InboxMessage.receive({
      messageId: 'message-123',
      consumerName: 'wager-transaction-consumer',
      payloadHash: 'payload-hash',
      receivedAt,
    });

    const processedAt =
      new Date('2026-09-02T12:01:00.000Z');

    message.markProcessed(processedAt);

    expect(message.isProcessed()).toBe(true);
    expect(message.processedAt).toEqual(processedAt);
  });

  it('should identify the same payload', () => {
    const message = InboxMessage.receive({
      messageId: 'message-123',
      consumerName: 'wager-transaction-consumer',
      payloadHash: 'payload-hash',
      receivedAt,
    });

    expect(
      message.matchesPayload('payload-hash'),
    ).toBe(true);

    expect(
      message.matchesPayload('different-hash'),
    ).toBe(false);
  });

  it.each([
    ['messageId', { messageId: '' }],
    ['consumerName', { consumerName: ' ' }],
    ['payloadHash', { payloadHash: '' }],
  ])(
    'should reject an empty %s',
    (_, invalidProps) => {
      expect(() =>
        InboxMessage.receive({
          messageId: 'message-123',
          consumerName:
            'wager-transaction-consumer',
          payloadHash: 'payload-hash',
          receivedAt,
          ...invalidProps,
        }),
      ).toThrow();
    },
  );

  it('should not process the message twice', () => {
    const message = InboxMessage.receive({
      messageId: 'message-123',
      consumerName: 'wager-transaction-consumer',
      payloadHash: 'payload-hash',
      receivedAt,
    });

    message.markProcessed(
      new Date('2026-09-02T12:01:00.000Z'),
    );

    expect(() =>
      message.markProcessed(
        new Date('2026-09-02T12:02:00.000Z'),
      ),
    ).toThrow('Inbox message is already processed');
  });

  it('should rehydrate a processed message', () => {
    const processedAt =
      new Date('2026-09-02T12:01:00.000Z');

    const message = InboxMessage.rehydrate({
      messageId: 'message-123',
      consumerName: 'wager-transaction-consumer',
      payloadHash: 'payload-hash',
      receivedAt,
      processedAt,
    });

    expect(message.isProcessed()).toBe(true);
    expect(message.processedAt).toEqual(processedAt);
  });
});