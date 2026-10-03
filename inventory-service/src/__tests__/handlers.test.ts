import * as grpc from '@grpc/grpc-js';
import { reserveStock } from '../handlers';
import { pool } from '../db';

jest.mock('../db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe('inventory-service handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails with FAILED_PRECONDITION when stock is insufficient', async () => {
    // When stock is insufficient, the UPDATE ... WHERE stock >= qty returns rowCount 0
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    });

    const mockCall = {
      request: { product_id: 3, quantity: 100 },
    } as any;

    const mockCallback = jest.fn();

    await reserveStock(mockCall, mockCallback);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: grpc.status.FAILED_PRECONDITION,
        message: expect.stringContaining('Insufficient stock for product 3'),
      })
    );
  });
});
