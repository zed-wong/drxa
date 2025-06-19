import { EventEmitter } from "events";
import { Logger } from "../../types/index.js";

export interface EventData {
  timestamp: Date;
  source: string;
  [key: string]: unknown;
}

export interface ChainEvent extends EventData {
  chain: string;
  type: 'transaction' | 'block' | 'error' | 'status';
}

export interface TransactionEvent extends ChainEvent {
  type: 'transaction';
  txHash: string;
  from: string;
  to: string;
  amount: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface BlockEvent extends ChainEvent {
  type: 'block';
  blockNumber: number;
  blockHash: string;
  transactionCount: number;
}

export interface ErrorEvent extends ChainEvent {
  type: 'error';
  error: Error;
  context?: Record<string, unknown>;
}

export interface StatusEvent extends ChainEvent {
  type: 'status';
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  details?: string;
}

export type ChainEventType = TransactionEvent | BlockEvent | ErrorEvent | StatusEvent;

export interface EventFilter {
  chains?: string[];
  types?: ChainEvent['type'][];
  addresses?: string[];
}

export type EventHandler<T extends EventData = EventData> = (event: T) => void | Promise<void>;

export interface Subscription {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
  unsubscribe: () => void;
}

export class EventBus extends EventEmitter {
  private static instance: EventBus;
  private subscriptions = new Map<string, Subscription>();
  private eventHistory: ChainEventType[] = [];
  private readonly maxHistorySize: number;
  private readonly logger?: Logger;
  private subscriptionCounter = 0;

  constructor(maxHistorySize = 1000, logger?: Logger) {
    super();
    this.maxHistorySize = maxHistorySize;
    this.logger = logger;
    this.setMaxListeners(0); // Unlimited listeners
  }

  static getInstance(logger?: Logger): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus(1000, logger);
    }
    return EventBus.instance;
  }

  // Subscribe to events with filtering
  subscribe<T extends ChainEventType = ChainEventType>(
    filter: EventFilter,
    handler: EventHandler<T>
  ): Subscription {
    const id = `sub_${++this.subscriptionCounter}`;
    
    const wrappedHandler = (event: ChainEventType) => {
      if (this.matchesFilter(event, filter)) {
        handler(event as T);
      }
    };

    this.on('chain-event', wrappedHandler);

    const subscription: Subscription = {
      id,
      filter,
      handler: wrappedHandler as EventHandler,
      unsubscribe: () => {
        this.off('chain-event', wrappedHandler);
        this.subscriptions.delete(id);
      }
    };

    this.subscriptions.set(id, subscription);
    this.logger?.debug('Event subscription created', { id, filter });

    return subscription;
  }

  // Subscribe to specific chain events
  subscribeToChain(
    chain: string,
    handler: EventHandler<ChainEventType>
  ): Subscription {
    return this.subscribe({ chains: [chain] }, handler);
  }

  // Subscribe to specific event types
  subscribeToType<T extends ChainEventType = ChainEventType>(
    type: ChainEvent['type'],
    handler: EventHandler<T>
  ): Subscription {
    return this.subscribe({ types: [type] }, handler);
  }

  // Subscribe to specific addresses
  subscribeToAddress(
    address: string,
    handler: EventHandler<TransactionEvent>
  ): Subscription {
    return this.subscribe(
      { addresses: [address], types: ['transaction'] },
      handler as EventHandler<ChainEventType>
    );
  }

  // Publish events
  publish(event: ChainEventType): void {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Emit to subscribers
    this.emit('chain-event', event);
    
    // Log event
    this.logger?.debug('Event published', {
      type: event.type,
      chain: event.chain,
      source: event.source
    });
  }

  // Batch publish events
  publishBatch(events: ChainEventType[]): void {
    for (const event of events) {
      this.publish(event);
    }
  }

  // Get event history
  getHistory(filter?: EventFilter, limit = 100): ChainEventType[] {
    let history = [...this.eventHistory];
    
    if (filter) {
      history = history.filter(event => this.matchesFilter(event, filter));
    }
    
    return history.slice(-limit);
  }

  // Clear event history
  clearHistory(): void {
    this.eventHistory = [];
  }

  // Get active subscriptions
  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  // Unsubscribe all
  unsubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.logger?.info('All subscriptions removed');
  }

  // Helper to match events against filters
  private matchesFilter(event: ChainEventType, filter: EventFilter): boolean {
    if (filter.chains && !filter.chains.includes(event.chain)) {
      return false;
    }

    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }

    if (filter.addresses && event.type === 'transaction') {
      const txEvent = event as TransactionEvent;
      if (!filter.addresses.includes(txEvent.from) && !filter.addresses.includes(txEvent.to)) {
        return false;
      }
    }

    return true;
  }

  // Create typed event factories
  static createTransactionEvent(
    chain: string,
    source: string,
    data: {
      txHash: string;
      from: string;
      to: string;
      amount: string;
      status: 'pending' | 'confirmed' | 'failed';
    }
  ): TransactionEvent {
    return {
      type: 'transaction',
      chain,
      source,
      timestamp: new Date(),
      ...data
    };
  }

  static createBlockEvent(
    chain: string,
    source: string,
    data: {
      blockNumber: number;
      blockHash: string;
      transactionCount: number;
    }
  ): BlockEvent {
    return {
      type: 'block',
      chain,
      source,
      timestamp: new Date(),
      ...data
    };
  }

  static createErrorEvent(
    chain: string,
    source: string,
    error: Error,
    context?: Record<string, unknown>
  ): ErrorEvent {
    return {
      type: 'error',
      chain,
      source,
      timestamp: new Date(),
      error,
      context
    };
  }

  static createStatusEvent(
    chain: string,
    source: string,
    status: StatusEvent['status'],
    details?: string
  ): StatusEvent {
    return {
      type: 'status',
      chain,
      source,
      timestamp: new Date(),
      status,
      details
    };
  }
}