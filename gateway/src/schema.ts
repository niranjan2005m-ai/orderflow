// GraphQL Schema for the API Gateway
export const typeDefs = `#graphql
  type Product {
    id: ID!
    name: String!
    price: Float!
    stock: Int!
  }

  type Order {
    id: ID!
    customerName: String!
    productId: Int!
    quantity: Int!
    price: Float!
    status: String!
    createdAt: String!
  }

  type Query {
    products: [Product!]!
    orders: [Order!]!
    order(id: ID!): Order
  }

  type Mutation {
    placeOrder(productId: Int!, quantity: Int!, customerName: String!): Order!
    cancelOrder(orderId: Int!): Order!
  }
`;
