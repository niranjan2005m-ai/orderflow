import * as grpc from '@grpc/grpc-js';
import { pool } from './db';
import { reserveStock, releaseStock } from './inventoryClient';

// ---- Type definitions matching order.proto messages ----
interface CreateOrderRequest  { product_id: number; quantity: number; customer_name: string }
interface GetOrderRequest     { id: number }
interface ListOrdersRequest   { /* empty */ }
interface CancelOrderRequest  { id: number }

// Shape of a row returned from the orders table
interface OrderRow {
  id: number;
  customer_name: string;
  product_id: number;
  quantity: number;
  price: string;      // pg returns NUMERIC as a string
  status: string;
  created_at: Date;
}

// Helper: convert a DB row to the gRPC response message shape
function rowToResponse(row: OrderRow) {
  return {
    id:            row.id,
    customer_name: row.customer_name,
    product_id:    row.product_id,
    quantity:      row.quantity,
    price:         parseFloat(row.price),
    status:        row.status,
    created_at:    row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CreateOrder
//
// Flow:
//   1. Call inventory-service ReserveStock (gRPC) — reduces stock atomically.
//   2. If stock is insufficient, inventory-service returns FAILED_PRECONDITION;
//      we propagate that error straight back to the caller.
//   3. Open a single pg client, BEGIN a transaction.
//   4. INSERT the order row.
//   5. INSERT an outbox_events row — same transaction, so both succeed or fail
//      together. This is the Transactional Outbox Pattern.
//   6. COMMIT and return the order.
//
// IMPORTANT: We never publish to Kafka here. The outbox publisher loop (see
// outboxPublisher.ts) handles that separately, giving us at-least-once delivery.
// ---------------------------------------------------------------------------
export async function createOrder(
  call: grpc.ServerUnaryCall<CreateOrderRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const { product_id, quantity, customer_name } = call.request;
  console.log(`[OrderService] CreateOrder received: customer="${customer_name}", product_id=${product_id}, quantity=${quantity}`);

  // Step 1: Reserve stock over gRPC (this also gives us the unit price)
  let price: number;
  try {
    console.log(`[OrderService] Calling inventory-service.ReserveStock(product_id=${product_id}, quantity=${quantity})`);
    const reservation = await reserveStock(product_id, quantity);
    price = reservation.price;
    console.log(`[OrderService] Stock reserved at price=${price}. Starting DB transaction...`);
  } catch (err: unknown) {
    // If inventory-service returned FAILED_PRECONDITION, forward it as-is
    const grpcErr = err as grpc.ServiceError;
    console.warn(`[OrderService] Stock reservation failed: ${grpcErr.message}`);
    callback({
      code:    grpcErr.code ?? grpc.status.INTERNAL,
      message: grpcErr.message,
    });
    return;
  }

  // Step 2: Write order + outbox event in ONE database transaction
  // Checking out a single client lets us issue BEGIN / COMMIT on the same
  // connection — pool.query() could use different connections each time.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert the order
    const orderResult = await client.query<OrderRow>(
      `INSERT INTO orders (customer_name, product_id, quantity, price, status)
       VALUES ($1, $2, $3, $4, 'CONFIRMED')
       RETURNING *`,
      [customer_name, product_id, quantity, price]
    );
    const order = orderResult.rows[0];

    // Build the event payload that Kafka consumers will receive
    const payload = {
      event_type:    'order.created',
      order_id:      order.id,
      customer_name: order.customer_name,
      product_id:    order.product_id,
      quantity:      order.quantity,
      price:         parseFloat(order.price),
    };

    // Insert the outbox event in the SAME transaction.
    // published_at stays NULL until the outbox publisher loop runs.
    const outboxResult = await client.query<{ id: number }>(
      `INSERT INTO outbox_events (event_type, aggregate_id, payload)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['order.created', order.id, JSON.stringify(payload)]
    );

    await client.query('COMMIT');
    console.log(`[OrderService] Transaction COMMITTED: inserted order id=${order.id} and outbox event id=${outboxResult.rows[0].id}`);

    callback(null, rowToResponse(order));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OrderService] CreateOrder transaction failed, rolled back:', err);
    callback({ code: grpc.status.INTERNAL, message: 'Failed to create order' });
  } finally {
    client.release(); // return the client to the pool
  }
}

// ---------------------------------------------------------------------------
// GetOrder – look up a single order by id
// ---------------------------------------------------------------------------
export async function getOrder(
  call: grpc.ServerUnaryCall<GetOrderRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const { id } = call.request;

  const result = await pool.query<OrderRow>(
    'SELECT * FROM orders WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    callback({ code: grpc.status.NOT_FOUND, message: `Order ${id} not found` });
    return;
  }

  callback(null, rowToResponse(result.rows[0]));
}

// ---------------------------------------------------------------------------
// ListOrders – return all orders
// ---------------------------------------------------------------------------
export async function listOrders(
  _call: grpc.ServerUnaryCall<ListOrdersRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const result = await pool.query<OrderRow>(
    'SELECT * FROM orders ORDER BY id'
  );
  callback(null, { orders: result.rows.map(rowToResponse) });
}

// ---------------------------------------------------------------------------
// CancelOrder – mark order CANCELLED and release stock back to inventory
// ---------------------------------------------------------------------------
export async function cancelOrder(
  call: grpc.ServerUnaryCall<CancelOrderRequest, unknown>,
  callback: grpc.sendUnaryData<unknown>
): Promise<void> {
  const { id } = call.request;

  const result = await pool.query<OrderRow>(
    `UPDATE orders SET status = 'CANCELLED' WHERE id = $1 RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    callback({ code: grpc.status.NOT_FOUND, message: `Order ${id} not found` });
    return;
  }

  const order = result.rows[0];

  // Release stock back to inventory-service over gRPC
  try {
    await releaseStock(order.product_id, order.quantity);
  } catch (err) {
    console.error('ReleaseStock failed for cancelled order:', err);
    // Order is already cancelled in the DB; log and continue
  }

  callback(null, rowToResponse(order));
}
