import { GraphQLError } from 'graphql';
import * as grpc from '@grpc/grpc-js';
import { orderClient, inventoryClient, grpcCall } from './clients';

// Helper to convert gRPC errors to user-friendly GraphQLErrors
function handleGrpcError(error: any): never {
  const code = error?.code;
  const message = error?.details || error?.message || 'An internal error occurred';

  if (code === grpc.status.NOT_FOUND) {
    throw new GraphQLError(message, {
      extensions: { code: 'NOT_FOUND', http: { status: 404 } },
    });
  }

  if (code === grpc.status.FAILED_PRECONDITION) {
    throw new GraphQLError(message, {
      extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
    });
  }

  if (code === grpc.status.INVALID_ARGUMENT) {
    throw new GraphQLError(message, {
      extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
    });
  }

  throw new GraphQLError(message, {
    extensions: { code: 'INTERNAL_SERVER_ERROR', http: { status: 500 } },
  });
}

function formatOrder(order: any) {
  return {
    id: String(order.id),
    customerName: order.customer_name,
    productId: order.product_id,
    quantity: order.quantity,
    price: order.price,
    status: order.status,
    createdAt: order.created_at,
  };
}

export const resolvers = {
  Query: {
    products: async () => {
      console.log('[Gateway] Query.products -> gRPC inventory.ListProducts');
      try {
        const response = await grpcCall<{ products: any[] }>(
          inventoryClient,
          'listProducts',
          {}
        );
        return (response.products || []).map((p) => ({
          id: String(p.id),
          name: p.name,
          price: p.price,
          stock: p.stock,
        }));
      } catch (err) {
        handleGrpcError(err);
      }
    },

    orders: async () => {
      console.log('[Gateway] Query.orders -> gRPC order.ListOrders');
      try {
        const response = await grpcCall<{ orders: any[] }>(
          orderClient,
          'listOrders',
          {}
        );
        return (response.orders || []).map(formatOrder);
      } catch (err) {
        handleGrpcError(err);
      }
    },

    order: async (_: unknown, { id }: { id: string }) => {
      console.log(`[Gateway] Query.order(${id}) -> gRPC order.GetOrder`);
      try {
        const order = await grpcCall<any>(orderClient, 'getOrder', {
          id: parseInt(id, 10),
        });
        return formatOrder(order);
      } catch (err) {
        handleGrpcError(err);
      }
    },
  },

  Mutation: {
    placeOrder: async (
      _: unknown,
      {
        productId,
        quantity,
        customerName,
      }: { productId: number; quantity: number; customerName: string }
    ) => {
      console.log(
        `[Gateway] Mutation.placeOrder received: customer="${customerName}", productId=${productId}, qty=${quantity}`
      );
      try {
        const order = await grpcCall<any>(orderClient, 'createOrder', {
          product_id: productId,
          quantity,
          customer_name: customerName,
        });
        console.log(`[Gateway] Mutation.placeOrder succeeded: orderId=${order.id}`);
        return formatOrder(order);
      } catch (err) {
        handleGrpcError(err);
      }
    },

    cancelOrder: async (_: unknown, { orderId }: { orderId: number }) => {
      console.log(`[Gateway] Mutation.cancelOrder received: orderId=${orderId}`);
      try {
        const order = await grpcCall<any>(orderClient, 'cancelOrder', {
          id: orderId,
        });
        console.log(`[Gateway] Mutation.cancelOrder succeeded: orderId=${order.id}`);
        return formatOrder(order);
      } catch (err) {
        handleGrpcError(err);
      }
    },
  },
};
