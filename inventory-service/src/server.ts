import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { getProduct, listProducts, reserveStock, releaseStock } from './handlers';

// ---- Load the proto file at runtime ----
// @grpc/proto-loader reads the .proto file and converts it into a JS object
// that @grpc/grpc-js can use to create a typed gRPC server or client.
const PROTO_PATH = path.resolve(__dirname, '../../proto/inventory.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase:    true,   // preserve field names (snake_case) from the .proto
  longs:       String,
  enums:       String,
  defaults:    true,
  oneofs:      true,
});

// GrpcObject is the top-level namespace; cast to access our service definition
const inventoryProto = grpc.loadPackageDefinition(packageDefinition) as any;

// ---- Build the gRPC server ----
const server = new grpc.Server();

// Register every RPC defined in inventory.proto with its handler function.
// The keys here ('getProduct', etc.) must match the rpc names in the .proto.
server.addService(inventoryProto.inventory.InventoryService.service, {
  getProduct,
  listProducts,
  reserveStock,
  releaseStock,
});

const port = process.env.INVENTORY_SERVICE_PORT || '50052';

server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(), // plain TCP — TLS is out of scope
  (err, boundPort) => {
    if (err) {
      console.error('Failed to start inventory-service:', err);
      process.exit(1);
    }
    console.log(`inventory-service listening on port ${boundPort}`);
  }
);
