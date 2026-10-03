/**
 * Phase 2 GraphQL Gateway Test Script
 * Tests:
 * 1. Query products
 * 2. Mutation placeOrder (success: Monitor x1)
 * 3. Mutation placeOrder (failure: Monitor x100 - insufficient stock)
 * 4. Query orders
 */

async function main() {
  console.log('\n=== PHASE 2 GRAPHQL GATEWAY TEST ===\n');

  async function gql(query: string, variables?: object) {
    const res = await fetch('http://localhost:4000', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }

  // 1. Query products
  console.log('--- 1. Query: products ---');
  const products = await gql('{ products { id name price stock } }');
  console.log(JSON.stringify(products, null, 2));

  // 2. Place an order (success)
  console.log('\n--- 2. Mutation: placeOrder (Success: Monitor x 1) ---');
  const orderRes = await gql(
    `mutation PlaceOrder($pId: Int!, $qty: Int!, $name: String!) {
      placeOrder(productId: $pId, quantity: $qty, customerName: $name) {
        id
        customerName
        productId
        quantity
        price
        status
        createdAt
      }
    }`,
    { pId: 3, qty: 1, name: 'Niranjan' }
  );
  console.log(JSON.stringify(orderRes, null, 2));

  // 3. Place an order with insufficient stock (failure)
  console.log('\n--- 3. Mutation: placeOrder (Fail: Monitor x 100 - Insufficient Stock) ---');
  const failRes = await gql(
    `mutation PlaceOrder($pId: Int!, $qty: Int!, $name: String!) {
      placeOrder(productId: $pId, quantity: $qty, customerName: $name) {
        id
      }
    }`,
    { pId: 3, qty: 100, name: 'Niranjan' }
  );
  console.log(JSON.stringify(failRes, null, 2));

  console.log('\n=== PHASE 2 TEST COMPLETE ===\n');
}

main().catch(console.error);
