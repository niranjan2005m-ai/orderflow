import { createOrder } from '../handlers';
import { publishBatch } from '../outboxPublisher';
import { pool } from '../db';
import * as inventoryClient from '../inventoryClient';

// Mock DB pool
jest.mock('../db', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

// Mock inventory client
jest.mock('../inventoryClient', () => ({
  reserveStock: jest.fn(),
  releaseStock: jest.fn(),
}));

// Mock Kafka with runtime-evaluated function pointers
const mockSend = jest.fn();
const mockConnect = jest.fn();

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockImplementation(() => ({
      connect: (...args: any[]) => mockConnect(...args),
      send: (...args: any[]) => mockSend(...args),
    })),
  })),
}));

describe('order-service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 2: Order creation inserts BOTH an order row and an outbox row in one transaction
  it('inserts BOTH an order row and an outbox row in a single database transaction', async () => {
    (inventoryClient.reserveStock as jest.Mock).mockResolvedValueOnce({ price: 1000 });

    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (pool.connect as jest.Mock).mockResolvedValueOnce(mockClient);

    // Mock responses for: BEGIN, INSERT orders, INSERT outbox_events, COMMIT
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({  // INSERT orders
        rows: [
          {
            id: 10,
            customer_name: 'Niranjan',
            product_id: 2,
            quantity: 3,
            price: '1000',
            status: 'CONFIRMED',
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({  // INSERT outbox_events
        rows: [{ id: 10 }],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const mockCall = {
      request: { product_id: 2, quantity: 3, customer_name: 'Niranjan' },
    } as any;

    const mockCallback = jest.fn();

    await createOrder(mockCall, mockCallback);

    expect(mockCallback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        id: 10,
        customer_name: 'Niranjan',
        product_id: 2,
        quantity: 3,
        status: 'CONFIRMED',
      })
    );

    // Verify transaction sequence and statements
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO orders'),
      expect.arrayContaining(['Niranjan', 2, 3, 1000])
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox_events'),
      expect.arrayContaining(['order.created', 10, expect.any(String)])
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  // Test 3: Outbox publisher leaves the event unpublished when Kafka publish fails
  it('leaves the event unpublished (published_at stays NULL) when Kafka publish fails', async () => {
    // DB returns 1 unpublished outbox event
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          event_type: 'order.created',
          aggregate_id: 42,
          payload: { order_id: 42, customer_name: 'Niranjan' },
        },
      ],
    });

    mockConnect.mockResolvedValueOnce(undefined);
    // Kafka producer throws an error on publish
    mockSend.mockRejectedValueOnce(new Error('Kafka broker connection lost'));

    await publishBatch();

    // Verify Kafka send was attempted
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'order.created',
      })
    );

    // Verify that the UPDATE statement marking published_at was NEVER called
    const queryCalls = (pool.query as jest.Mock).mock.calls;
    const updateCall = queryCalls.find((call) =>
      typeof call[0] === 'string' && call[0].includes('UPDATE outbox_events SET published_at')
    );
    expect(updateCall).toBeUndefined();
  });
});
