import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// ---- Build a gRPC client that talks to inventory-service ----
// This file creates the client once at startup so every handler can reuse it.
// gRPC clients are thread-safe (Node.js is single-threaded, so this is fine).

const PROTO_PATH = path.resolve(__dirname, '../../proto/inventory.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const inventoryProto = grpc.loadPackageDefinition(packageDefinition) as any;

const addr = process.env.INVENTORY_SERVICE_ADDR || 'localhost:50052';

// grpc.credentials.createInsecure() = plain TCP, no TLS (fine for a local project)
export const inventoryClient = new inventoryProto.inventory.InventoryService(
  addr,
  grpc.credentials.createInsecure()
);

// ---- Promisified helpers ----
// gRPC-js uses callbacks by default; wrapping them in Promises makes the
// handler code read like normal async/await instead of nested callbacks.

export function reserveStock(
  productId: number,
  quantity: number
): Promise<{ price: number }> {
  return new Promise((resolve, reject) => {
    inventoryClient.reserveStock(
      { product_id: productId, quantity },
      (err: grpc.ServiceError | null, response: { price: number }) => {
        if (err) reject(err);
        else resolve(response);
      }
    );
  });
}

export function releaseStock(
  productId: number,
  quantity: number
): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    inventoryClient.releaseStock(
      { product_id: productId, quantity },
      (err: grpc.ServiceError | null, response: { success: boolean }) => {
        if (err) reject(err);
        else resolve(response);
      }
    );
  });
}
