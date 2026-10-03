import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  const port = parseInt(process.env.GATEWAY_PORT || '4000', 10);

  const { url } = await startStandaloneServer(server, {
    listen: { port },
  });

  console.log(`[Gateway] Apollo GraphQL Server ready at ${url}`);
}

startServer().catch((err) => {
  console.error('[Gateway] Failed to start Apollo Server:', err);
  process.exit(1);
});
