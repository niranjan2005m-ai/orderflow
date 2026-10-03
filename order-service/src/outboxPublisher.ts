import { Kafka } from 'kafkajs';
import { pool } from './db';

// ---------------------------------------------------------------------------
// Transactional Outbox Publisher
//
// This runs in the same process as the order-service gRPC server but as an
// independent polling loop. Every 2 seconds it:
//   1. Selects a small batch of outbox_events where published_at IS NULL.
//   2. Publishes each event to the Kafka topic 'order.created'.
//   3. On success, marks the row with published_at = now().
//
// WHY THIS PATTERN?
//   The order handler writes the order row AND the outbox_events row in ONE
//   database transaction (see handlers.ts). This guarantees that if the app
//   crashes after the order is saved but before publishing to Kafka, the event
//   is not lost — it sits unpublished in the DB and the next poll picks it up.
//
//   This gives AT-LEAST-ONCE delivery: if we crash after publishing but before
//   marking published_at, we'll publish the event again on the next poll.
//   Consumers should handle duplicate events idempotently (e.g. deduplicate
//   by order_id) in a production system.
//
// IF KAFKA IS UNAVAILABLE:
//   The publish call throws, we catch it, log it, and do NOT update
//   published_at. The event stays unpublished and will be retried next loop.
// ---------------------------------------------------------------------------

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'order-service',
  brokers:  [process.env.KAFKA_BROKER   || 'localhost:9094'],
});

const producer = kafka.producer();

let isConnected = false;

export async function startOutboxPublisher(): Promise<void> {
  try {
    await producer.connect();
    isConnected = true;
    console.log('Outbox publisher: Kafka producer connected');
  } catch (err) {
    console.warn('Outbox publisher: Kafka not ready yet, will retry connection when events arrive');
  }

  setInterval(async () => {
    try {
      // Fetch a small batch of unpublished events, oldest first.
      // LIMIT 10 prevents a huge batch if many events pile up.
      const result = await pool.query(
        `SELECT id, event_type, aggregate_id, payload
           FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY id
          LIMIT 10`
      );

      if (result.rows.length === 0) return;

      if (!isConnected) {
        try {
          await producer.connect();
          isConnected = true;
          console.log('Outbox publisher: Kafka producer connected');
        } catch (err) {
          console.error('Outbox publisher: Kafka unavailable, leaving events unpublished');
          return;
        }
      }

      for (const event of result.rows) {
        try {
          // Publish the event payload to the Kafka topic.
          // The key is the aggregate_id (order id) so that all events for the
          // same order land on the same partition (ordering guarantee).
          await producer.send({
            topic:    'order.created',
            messages: [{
              key:   String(event.aggregate_id),
              value: JSON.stringify(event.payload),
            }],
          });
          console.log(`[OutboxPublisher] Published outbox event id=${event.id} (order_id=${event.aggregate_id}) to Kafka topic 'order.created'`);

          // Mark published so we don't send it again
          await pool.query(
            'UPDATE outbox_events SET published_at = now() WHERE id = $1',
            [event.id]
          );

          console.log(`[OutboxPublisher] Marked outbox event id=${event.id} published_at = now()`);
        } catch (err) {
          // Kafka unavailable or publish failed — leave published_at NULL
          // and retry on the next interval. Do NOT crash the server.
          console.error(`[OutboxPublisher] Failed to publish event id=${event.id}:`, err);
        }
      }
    } catch (err) {
      // DB query failed — log and continue
      console.error('Outbox publisher: DB query failed:', err);
    }
  }, 2000); // poll every 2 seconds
}
