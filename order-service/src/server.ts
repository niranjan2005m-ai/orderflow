import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { createOrder, getOrder, listOrders, cancelOrder } from './handlers';
import { startOutboxPublisher } from './outboxPublisher';

// ---- Load the proto file at runtime ----
const PROTO_PATH = path.resolve(__dirname, '../../proto/order.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const orderProto = grpc.loadPackageDefinition(packageDefinition) as any;

// ---- Build the gRPC server ----
const server = new grpc.Server();

server.addService(orderProto.order.OrderService.service, {
  createOrder,
  getOrder,
  listOrders,
  cancelOrder,
});

const port = process.env.ORDER_SERVICE_PORT || '50051';

server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (err, boundPort) => {
    if (err) {
      console.error('Failed to start order-service:', err);
      process.exit(1);
    }
    console.log(`order-service listening on port ${boundPort}`);

    // Start the outbox publisher loop in the background.
    // If Kafka is unavailable at startup (Phase 1), the publisher will log
    // errors and retry — the gRPC server itself stays up.
    startOutboxPublisher().catch((err) => {
      console.error('Outbox publisher failed to start:', err);
    });
  }
);
