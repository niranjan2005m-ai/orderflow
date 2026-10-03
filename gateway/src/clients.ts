import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// Paths to proto definitions at the root
const ORDER_PROTO_PATH = path.resolve(__dirname, '../../proto/order.proto');
const INVENTORY_PROTO_PATH = path.resolve(__dirname, '../../proto/inventory.proto');

const orderPackageDef = protoLoader.loadSync(ORDER_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const inventoryPackageDef = protoLoader.loadSync(INVENTORY_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const orderProto = grpc.loadPackageDefinition(orderPackageDef) as any;
const inventoryProto = grpc.loadPackageDefinition(inventoryPackageDef) as any;

const orderAddr = process.env.ORDER_SERVICE_ADDR || 'localhost:50051';
const inventoryAddr = process.env.INVENTORY_SERVICE_ADDR || 'localhost:50052';

export const orderClient = new orderProto.order.OrderService(
  orderAddr,
  grpc.credentials.createInsecure()
);

export const inventoryClient = new inventoryProto.inventory.InventoryService(
  inventoryAddr,
  grpc.credentials.createInsecure()
);

// Promisified gRPC helper functions
export function grpcCall<T>(client: any, method: string, request: object): Promise<T> {
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}
