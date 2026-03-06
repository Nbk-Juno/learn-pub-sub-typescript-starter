import amqp from "amqplib";
import {
  publishJSON,
  SimpleQueueType,
  declareAndBind,
} from "../internal/pubsub/pubsub.js";
import {
  ExchangePerilDirect,
  PauseKey,
  GameLogSlug,
  ExchangePerilTopic,
} from "../internal/routing/routing.js";
import { getInput, printServerHelp } from "../internal/gamelogic/gamelogic.js";

async function main() {
  const rabbitConnString = "amqp://guest:guest@localhost:5672/";
  const conn = await amqp.connect(rabbitConnString);
  const confirmChannel = await conn.createConfirmChannel();

  await declareAndBind(
    conn,
    ExchangePerilTopic,
    GameLogSlug,
    `${GameLogSlug}.*`,
    SimpleQueueType.Durable,
  );

  console.log("Starting Peril server...");

  printServerHelp();

  while (true) {
    const input = await getInput();

    if (input.length === 0) {
      continue;
    } else if (input[0] === "pause") {
      console.log("sending pause message...");
      publishJSON(confirmChannel, ExchangePerilDirect, PauseKey, {
        isPaused: true,
      });
    } else if (input[0] === "resume") {
      console.log("sending resume message...");
      publishJSON(confirmChannel, ExchangePerilDirect, PauseKey, {
        isPaused: false,
      });
    } else if (input[0] === "quit") {
      console.log("exiting...");
      break;
    } else {
      console.log("unknown command");
    }
  }

  ["SIGINT", "SIGTERM"].forEach((signal) =>
    process.on(signal, async () => {
      try {
        await conn.close();
        console.log("RabbitMQ connection closed.");
      } catch (err) {
        console.error("Error closing RabbitMQ connection:", err);
      } finally {
        process.exit(0);
      }
    }),
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
