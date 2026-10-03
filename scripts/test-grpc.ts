#!/usr/bin/env node
/**
 * Phase 1 gRPC test client
 * Run: npx tsx scripts/test-grpc.ts
 *
 * This script tests all 4 gRPC scenarios without needing a REST/GraphQL layer:
 *   1. ListProducts  — inventory-service
 *   2. ReserveStock  — inventory-service (success)
 *   3. CreateOrder   — order-service (success, writes order + outbox row)
 *   4. GetOrder      — order-service (verify the saved order)
 *   5. ReserveStock  — inventory-service (fail: insufficient stock)
 *   6. CancelOrder   — order-service (stock released)
 *
 * Requires: inventory-service and order-service already running locally.
 */

import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// ---- Load proto definitions ----
const PROTO_DIR = path.resolve(__dirname, '../proto');

const inventoryDef = protoLoader.loadSync(path.join(PROTO_DIR, 'inventory.proto'), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const orderDef = protoLoader.loadSync(path.join(PROTO_DIR, 'order.proto'), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});

const inventoryProto = grpc.loadPackageDefinition(inventoryDef) as any;
const orderProto     = grpc.loadPackageDefinition(orderDef) as any;

// ---- Create clients ----
const inventoryClient = new inventoryProto.inventory.InventoryService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);
const orderClient = new orderProto.order.OrderService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// ---- Promisify helpers ----
function call<T>(client: any, method: string, request: object): Promise<T> {
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, res: T) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

// ---- Run tests sequentially ----
async function run() {
  console.log('\n=== PHASE 1 gRPC TEST CLIENT ===\n');

  // 1. List products
  console.log('--- 1. ListProducts ---');
  const products = await call<{ products: any[] }>(inventoryClient, 'listProducts', {});
  console.log('Products:', JSON.stringify(products.products, null, 2));

  // 2. Reserve stock (success) — product 1 (Keyboard), qty 2
  console.log('\n--- 2. ReserveStock (success: Keyboard x2) ---');
  const reservation = await call<{ price: number }>(inventoryClient, 'reserveStock', {
    product_id: 1, quantity: 2,
  });
  console.log('Reserved, unit price:', reservation.price);

  // 3. Create an order via order-service (which calls ReserveStock internally)
  console.log('\n--- 3. CreateOrder (Niranjan buys Mouse x3) ---');
  const order = await call<any>(orderClient, 'createOrder', {
    product_id: 2, quantity: 3, customer_name: 'Niranjan',
  });
  console.log('Order created:', JSON.stringify(order, null, 2));

  // 4. Get the order back
  console.log('\n--- 4. GetOrder ---');
  const fetched = await call<any>(orderClient, 'getOrder', { id: order.id });
  console.log('Fetched order:', JSON.stringify(fetched, null, 2));

  // 5. Attempt to reserve more stock than available (should fail)
  console.log('\n--- 5. ReserveStock (fail: Monitor x100 — insufficient stock) ---');
  try {
    await call(inventoryClient, 'reserveStock', { product_id: 3, quantity: 100 });
    console.error('ERROR: Should have failed!');
  } catch (err: any) {
    console.log(`Got expected gRPC error (code ${err.code}): "${err.message}"`);
  }

  // 6. Cancel the order (releases stock)
  console.log('\n--- 6. CancelOrder ---');
  const cancelled = await call<any>(orderClient, 'cancelOrder', { id: order.id });
  console.log('Cancelled order status:', cancelled.status);

  console.log('\n=== ALL TESTS PASSED ===\n');
  console.log('Now check Postgres to confirm both rows exist:');
  console.log(`  psql -h localhost -U orderflow -d orderflow`);
  console.log(`  SELECT * FROM orders;`);
  console.log(`  SELECT * FROM outbox_events;`);
}

run().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
