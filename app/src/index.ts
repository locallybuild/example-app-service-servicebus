import { runConsumer } from "./consumer";
import { runProducer } from "./producer";

// Both apps ship as one image; the ROLE app setting decides which this
// container runs as - see 6-app-service.tf.
const PORT = Number(process.env.PORT ?? 8080);
const ROLE = process.env.ROLE;

async function main(): Promise<void> {
  switch (ROLE) {
    case "producer":
      return runProducer(PORT);
    case "consumer":
      return runConsumer(PORT);
    default:
      throw new Error(`the environment variable ROLE must be "producer" or "consumer", got ${JSON.stringify(ROLE)}`);
  }
}

main().catch((err) => {
  console.error("failed to start:", err);
  process.exit(1);
});
