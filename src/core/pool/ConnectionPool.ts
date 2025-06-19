import { EventEmitter } from "events";
import { Logger } from "../../types/index.js";
import { ErrorFactory, ErrorCode } from "../errors/index.js";

export interface PoolConfig {
  maxSize: number;
  minSize: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  reapIntervalMs: number;
  createTimeoutMs: number;
  destroyTimeoutMs: number;
  validateOnBorrow: boolean;
  validateOnReturn: boolean;
}

export interface Connection {
  id: string;
  resource: any;
  createdAt: Date;
  lastUsedAt: Date;
  inUse: boolean;
  isValid?: boolean;
}

export interface ConnectionFactory<T> {
  create(): Promise<T>;
  destroy(resource: T): Promise<void>;
  validate?(resource: T): Promise<boolean>;
}

export class ConnectionPool<T = any> extends EventEmitter {
  private readonly config: PoolConfig;
  private readonly factory: ConnectionFactory<T>;
  private readonly logger?: Logger;
  private readonly connections = new Map<string, Connection>();
  private readonly waitingQueue: Array<{
    resolve: (connection: Connection) => void;
    reject: (error: Error) => void;
    timestamp: Date;
  }> = [];
  
  private connectionCounter = 0;
  private isDestroyed = false;
  private reapTimer?: NodeJS.Timeout;

  constructor(
    factory: ConnectionFactory<T>,
    config: Partial<PoolConfig> = {},
    logger?: Logger
  ) {
    super();
    
    this.factory = factory;
    this.logger = logger;
    this.config = {
      maxSize: 10,
      minSize: 2,
      acquireTimeoutMs: 30000,
      idleTimeoutMs: 300000, // 5 minutes
      reapIntervalMs: 60000,  // 1 minute
      createTimeoutMs: 30000,
      destroyTimeoutMs: 5000,
      validateOnBorrow: true,
      validateOnReturn: false,
      ...config
    };

    // Validate config
    if (this.config.minSize > this.config.maxSize) {
      throw new Error('minSize cannot be greater than maxSize');
    }

    // Start the reaper
    this.startReaper();
    
    // Pre-fill with minimum connections
    this.ensureMinimumConnections();
  }

  // Acquire a connection from the pool
  async acquire(): Promise<Connection> {
    if (this.isDestroyed) {
      throw new Error('Connection pool has been destroyed');
    }

    // Try to get an available connection
    const availableConnection = this.getAvailableConnection();
    if (availableConnection) {
      return this.borrowConnection(availableConnection);
    }

    // Create new connection if under max size
    if (this.connections.size < this.config.maxSize) {
      try {
        const connection = await this.createConnection();
        return this.borrowConnection(connection);
      } catch (error) {
        this.logger?.error('Failed to create connection', error as Error);
        throw error;
      }
    }

    // Wait for available connection
    return this.waitForConnection();
  }

  // Release a connection back to the pool
  async release(connection: Connection): Promise<void> {
    if (this.isDestroyed) {
      await this.destroyConnection(connection);
      return;
    }

    if (!this.connections.has(connection.id)) {
      this.logger?.warn('Attempting to release unknown connection', { id: connection.id });
      return;
    }

    connection.inUse = false;
    connection.lastUsedAt = new Date();

    // Validate on return if configured
    if (this.config.validateOnReturn && this.factory.validate) {
      try {
        const isValid = await this.factory.validate(connection.resource);
        if (!isValid) {
          await this.destroyConnection(connection);
          this.ensureMinimumConnections();
          return;
        }
      } catch (error) {
        this.logger?.error('Connection validation failed on return', error as Error, { 
          connectionId: connection.id 
        });
        await this.destroyConnection(connection);
        this.ensureMinimumConnections();
        return;
      }
    }

    // Process waiting queue
    this.processWaitingQueue();

    this.emit('connectionReleased', connection);
  }

  // Get pool statistics
  getStats(): {
    totalConnections: number;
    availableConnections: number;
    inUseConnections: number;
    waitingRequests: number;
    minSize: number;
    maxSize: number;
  } {
    const available = Array.from(this.connections.values()).filter(c => !c.inUse).length;
    const inUse = this.connections.size - available;

    return {
      totalConnections: this.connections.size,
      availableConnections: available,
      inUseConnections: inUse,
      waitingRequests: this.waitingQueue.length,
      minSize: this.config.minSize,
      maxSize: this.config.maxSize
    };
  }

  // Destroy the pool and all connections
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    // Stop the reaper
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
    }

    // Reject all waiting requests
    while (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      waiter.reject(new Error('Connection pool destroyed'));
    }

    // Destroy all connections
    const destroyPromises = Array.from(this.connections.values()).map(
      connection => this.destroyConnection(connection)
    );

    await Promise.all(destroyPromises);
    this.connections.clear();

    this.emit('poolDestroyed');
    this.logger?.info('Connection pool destroyed');
  }

  // Private methods

  private getAvailableConnection(): Connection | null {
    for (const connection of this.connections.values()) {
      if (!connection.inUse) {
        return connection;
      }
    }
    return null;
  }

  private async borrowConnection(connection: Connection): Promise<Connection> {
    connection.inUse = true;
    connection.lastUsedAt = new Date();

    // Validate on borrow if configured
    if (this.config.validateOnBorrow && this.factory.validate) {
      try {
        const isValid = await this.factory.validate(connection.resource);
        if (!isValid) {
          await this.destroyConnection(connection);
          // Try to get another connection recursively
          return this.acquire();
        }
      } catch (error) {
        this.logger?.error('Connection validation failed on borrow', error as Error, { 
          connectionId: connection.id 
        });
        await this.destroyConnection(connection);
        return this.acquire();
      }
    }

    this.emit('connectionAcquired', connection);
    return connection;
  }

  private async createConnection(): Promise<Connection> {
    const id = `conn_${++this.connectionCounter}`;
    
    try {
      const resource = await Promise.race([
        this.factory.create(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Connection creation timeout')), this.config.createTimeoutMs)
        )
      ]);

      const connection: Connection = {
        id,
        resource,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        inUse: false
      };

      this.connections.set(id, connection);
      this.emit('connectionCreated', connection);
      this.logger?.debug('Connection created', { id });

      return connection;
    } catch (error) {
      this.logger?.error('Failed to create connection', error as Error, { id });
      throw ErrorFactory.networkError(`Failed to create connection: ${(error as Error).message}`);
    }
  }

  private async destroyConnection(connection: Connection): Promise<void> {
    this.connections.delete(connection.id);

    try {
      await Promise.race([
        this.factory.destroy(connection.resource),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Connection destruction timeout')), this.config.destroyTimeoutMs)
        )
      ]);

      this.emit('connectionDestroyed', connection);
      this.logger?.debug('Connection destroyed', { id: connection.id });
    } catch (error) {
      this.logger?.error('Failed to destroy connection', error as Error, { 
        connectionId: connection.id 
      });
    }
  }

  private async waitForConnection(): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.resolve === resolve);
        if (index >= 0) {
          this.waitingQueue.splice(index, 1);
        }
        reject(ErrorFactory.networkError('Connection acquisition timeout'));
      }, this.config.acquireTimeoutMs);

      this.waitingQueue.push({
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: new Date()
      });
    });
  }

  private processWaitingQueue(): void {
    while (this.waitingQueue.length > 0) {
      const availableConnection = this.getAvailableConnection();
      if (!availableConnection) {
        break;
      }

      const waiter = this.waitingQueue.shift()!;
      this.borrowConnection(availableConnection)
        .then(waiter.resolve)
        .catch(waiter.reject);
    }
  }

  private async ensureMinimumConnections(): Promise<void> {
    const available = Array.from(this.connections.values()).filter(c => !c.inUse).length;
    const needed = this.config.minSize - available;

    if (needed > 0 && this.connections.size < this.config.maxSize) {
      const createCount = Math.min(needed, this.config.maxSize - this.connections.size);
      
      for (let i = 0; i < createCount; i++) {
        try {
          await this.createConnection();
        } catch (error) {
          this.logger?.warn('Failed to create minimum connection', { error });
          break; // Stop trying if creation fails
        }
      }
    }
  }

  private startReaper(): void {
    this.reapTimer = setInterval(() => {
      this.reapIdleConnections();
    }, this.config.reapIntervalMs);
  }

  private async reapIdleConnections(): Promise<void> {
    const now = new Date();
    const idleConnections: Connection[] = [];

    for (const connection of this.connections.values()) {
      if (!connection.inUse) {
        const idleTime = now.getTime() - connection.lastUsedAt.getTime();
        if (idleTime > this.config.idleTimeoutMs) {
          idleConnections.push(connection);
        }
      }
    }

    // Only reap if we won't go below minimum
    const keepMinimum = this.connections.size - idleConnections.length >= this.config.minSize;
    if (keepMinimum) {
      for (const connection of idleConnections) {
        await this.destroyConnection(connection);
      }
    }

    if (idleConnections.length > 0) {
      this.logger?.debug('Reaped idle connections', { count: idleConnections.length });
    }
  }
}