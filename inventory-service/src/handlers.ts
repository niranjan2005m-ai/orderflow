import * as grpc from '@grpc/grpc-js';
import { pool } from './db';

// ---- Type definitions for gRPC handler arguments ----
// These match the message fields defined in inventory.proto.

interface GetProductRequest  { id: number }
interface ListProductsRequest { /* empty */ }

interface ReserveStockRequest { product_id: number; quantity: number }
interface ReleaseStockRequest { product_id: number; quantity: number }

// ---------------------------------------------------------------------------
// GetProduct – return a single product row by id
// ---------------------------------------------------------------------------
export async function getProduct(
  call: grpc.ServerUnaryCall<GetProductRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const { id } = call.request;

  const result = await pool.query(
    'SELECT id, name, price, stock FROM products WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    // gRPC NOT_FOUND maps to HTTP 404 conceptually
    callback({ code: grpc.status.NOT_FOUND, message: `Product ${id} not found` });
    return;
  }

  const row = result.rows[0];
  callback(null, {
    id:    row.id,
    name:  row.name,
    price: parseFloat(row.price),
    stock: row.stock,
  });
}

// ---------------------------------------------------------------------------
// ListProducts – return all products
// ---------------------------------------------------------------------------
export async function listProducts(
  _call: grpc.ServerUnaryCall<ListProductsRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const result = await pool.query(
    'SELECT id, name, price, stock FROM products ORDER BY id'
  );

  callback(null, {
    products: result.rows.map((row) => ({
      id:    row.id,
      name:  row.name,
      price: parseFloat(row.price),
      stock: row.stock,
    })),
  });
}

// ---------------------------------------------------------------------------
// ReserveStock – atomically check and decrement stock
//
// Uses a single UPDATE ... WHERE stock >= quantity to guarantee that we never
// go below zero even under concurrent requests (no explicit lock needed).
// Returns the unit price so the caller can store it in the order row.
// ---------------------------------------------------------------------------
export async function reserveStock(
  call: grpc.ServerUnaryCall<ReserveStockRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const { product_id, quantity } = call.request;

  // Decrement stock in one atomic statement; if stock < quantity the WHERE
  // clause won't match and rowCount will be 0.
  const result = await pool.query(
    `UPDATE products
        SET stock = stock - $1
      WHERE id = $2
        AND stock >= $1
      RETURNING price`,
    [quantity, product_id]
  );

  if (result.rowCount === 0) {
    // gRPC FAILED_PRECONDITION is the right code for "business rule violated"
    callback({
      code:    grpc.status.FAILED_PRECONDITION,
      message: `Insufficient stock for product ${product_id}`,
    });
    return;
  }

  callback(null, { price: parseFloat(result.rows[0].price) });
}

// ---------------------------------------------------------------------------
// ReleaseStock – add quantity back when an order is cancelled
// ---------------------------------------------------------------------------
export async function releaseStock(
  call: grpc.ServerUnaryCall<ReleaseStockRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const { product_id, quantity } = call.request;

  await pool.query(
    'UPDATE products SET stock = stock + $1 WHERE id = $2',
    [quantity, product_id]
  );

  callback(null, { success: true });
}
