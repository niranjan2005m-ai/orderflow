import { Kafka } from 'kafkajs';

const broker = process.env.KAFKA_BROKER || 'localhost:9094';
const clientId = process.env.KAFKA_CLIENT_ID || 'notification-service';

const kafka = new Kafka({
  clientId,
  brokers: [broker],
  retry: {
    initialRetryTime: 500,
    retries: 10,
  },
});

const consumer = kafka.consumer({ groupId: 'notification-service-group' });

async function startNotificationConsumer() {
  console.log(`[Notification Service] Connecting to Kafka broker at ${broker}...`);
  await consumer.connect();
  console.log('[Notification Service] Connected to Kafka.');

  await consumer.subscribe({ topic: 'order.created', fromBeginning: true });
  console.log('[Notification Service] Subscribed to topic "order.created"');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const rawValue = message.value?.toString();
        if (!rawValue) return;

        const event = JSON.parse(rawValue);
        // Requirement: Log "Notification: Order 1 created for Niranjan"
        console.log(`Notification: Order ${event.order_id} created for ${event.customer_name}`);
      } catch (err) {
        console.error('[Notification Service] Failed to process message:', err);
      }
    },
  });
}

startNotificationConsumer().catch((err) => {
  console.error('[Notification Service] Consumer failed to start:', err);
  process.exit(1);
});
