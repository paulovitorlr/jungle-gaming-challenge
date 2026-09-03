export type EventContext = {
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
};
