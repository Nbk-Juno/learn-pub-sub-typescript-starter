import amqp, { type ConfirmChannel } from "amqplib";
import {
  clientWelcome,
  commandStatus,
  getInput,
  printClientHelp,
  printQuit,
} from "../internal/gamelogic/gamelogic.js";
import { GameState } from "../internal/gamelogic/gamestate.js";
import { type GameLog } from "../internal/gamelogic/logs.js";
import { commandMove } from "../internal/gamelogic/move.js";
import { commandSpawn } from "../internal/gamelogic/spawn.js";
import {
  SimpleQueueType,
  subscribeJSON,
  publishJSON,
  publishMsgPack,
} from "../internal/pubsub/pubsub.js";
import {
  ExchangePerilDirect,
  ExchangePerilTopic,
  PauseKey,
  ArmyMovesPrefix,
  WarRecognitionsPrefix,
  GameLogSlug,
} from "../internal/routing/routing.js";
import { handlerMove, handlerPause, handlerWar } from "./handlers.js";

async function main() {
  const rabbitConnString = "amqp://guest:guest@localhost:5672/";
  const conn = await amqp.connect(rabbitConnString);
  const confirmChannel = await conn.createConfirmChannel();

  const userName = await clientWelcome();

  const gs = new GameState(userName);

  await subscribeJSON(
    conn,
    ExchangePerilDirect,
    `pause.${userName}`,
    PauseKey,
    SimpleQueueType.Transient,
    handlerPause(gs),
  );

  await subscribeJSON(
    conn,
    ExchangePerilTopic,
    `${ArmyMovesPrefix}.${userName}`,
    `${ArmyMovesPrefix}.*`,
    SimpleQueueType.Transient,
    handlerMove(gs, confirmChannel),
  );

  await subscribeJSON(
    conn,
    ExchangePerilTopic,
    `${WarRecognitionsPrefix}`,
    `${WarRecognitionsPrefix}.*`,
    SimpleQueueType.Durable,
    handlerWar(gs, confirmChannel, publishGameLog),
  );

  while (true) {
    const input = await getInput();

    try {
      if (input[0] === "spawn") {
        commandSpawn(gs, input);
      } else if (input[0] === "move") {
        const playerMove = commandMove(gs, input);
        publishJSON(
          confirmChannel,
          ExchangePerilTopic,
          `${ArmyMovesPrefix}.${userName}`,
          playerMove,
        );
        console.log("Move published succesfully");
      } else if (input[0] === "status") {
        commandStatus(gs);
      } else if (input[0] === "help") {
        printClientHelp();
      } else if (input[0] === "spam") {
        console.log("Spamming not allowed yet!");
      } else if (input[0] === "quit") {
        printQuit();
        break;
      } else {
        console.log("Unknown Command");
      }
    } catch (error) {
      console.log(`Error: ${error}`);
    }
  }

  async function publishGameLog(
    ch: ConfirmChannel,
    username: string,
    message: string,
  ): Promise<void> {
    const gameLog: GameLog = {
      username: username,
      message: message,
      currentTime: new Date(),
    };

    await publishMsgPack(
      ch,
      ExchangePerilTopic,
      `${GameLogSlug}.${username}`,
      gameLog,
    );
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
