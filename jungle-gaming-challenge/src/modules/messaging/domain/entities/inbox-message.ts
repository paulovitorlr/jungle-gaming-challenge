export type ReceiveInboxMessageProps = {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt?: Date;
};

export type InboxMessageState = {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
};

export class InboxMessage {
  private constructor(
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string,
    public readonly receivedAt: Date,
    private _processedAt?: Date,
  ) {}

  static receive(
    props: ReceiveInboxMessageProps,
  ): InboxMessage {
    InboxMessage.assertRequired(
      props.messageId,
      'Message id is required',
    );

    InboxMessage.assertRequired(
      props.consumerName,
      'Consumer name is required',
    );

    InboxMessage.assertRequired(
      props.payloadHash,
      'Payload hash is required',
    );

    return new InboxMessage(
      props.messageId,
      props.consumerName,
      props.payloadHash,
      props.receivedAt ?? new Date(),
    );
  }

  static rehydrate(
    state: InboxMessageState,
  ): InboxMessage {
    return new InboxMessage(
      state.messageId,
      state.consumerName,
      state.payloadHash,
      state.receivedAt,
      state.processedAt,
    );
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return this._processedAt !== undefined;
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  markProcessed(at: Date): void {
    if (this.isProcessed()) {
      throw new Error(
        'Inbox message is already processed',
      );
    }

    if (at < this.receivedAt) {
      throw new Error(
        'Processed date cannot be before received date',
      );
    }

    this._processedAt = at;
  }

  private static assertRequired(
    value: string,
    message: string,
  ): void {
    if (!value || value.trim().length === 0) {
      throw new Error(message);
    }
  }
}