import { type ConfirmChannel } from "amqplib";
import {
  type RecognitionOfWar,
  type ArmyMove,
} from "../internal/gamelogic/gamedata.js";
import {
  GameState,
  type PlayingState,
} from "../internal/gamelogic/gamestate.js";
import { handleMove, MoveOutcome } from "../internal/gamelogic/move.js";
import { handlePause } from "../internal/gamelogic/pause.js";
import { AckType, publishJSON } from "../internal/pubsub/pubsub.js";
import {
  ExchangePerilTopic,
  WarRecognitionsPrefix,
} from "../internal/routing/routing.js";
import { handleWar, WarOutcome } from "../internal/gamelogic/war.js";

export function handlerPause(gs: GameState): (ps: PlayingState) => AckType {
  return (ps: PlayingState) => {
    handlePause(gs, ps);
    process.stdout.write("> ");
    return AckType.Ack;
  };
}

export function handlerMove(
  gs: GameState,
  ch: ConfirmChannel,
): (am: ArmyMove) => Promise<AckType> {
  return async (am: ArmyMove) => {
    try {
      const outcome = handleMove(gs, am);

      if (outcome === MoveOutcome.Safe) {
        return AckType.Ack;
      }
      if (outcome === MoveOutcome.MakeWar) {
        const rw: RecognitionOfWar = {
          attacker: am.player,
          defender: gs.getPlayerSnap(),
        };
        try {
          await publishJSON(
            ch,
            ExchangePerilTopic,
            `${WarRecognitionsPrefix}.${gs.getPlayerSnap().username}`,
            rw,
          );
          return AckType.Ack;
        } catch (err) {
          console.error("Error publishing war recognition:", err);
          return AckType.NackRequeue;
        }
      }
      return AckType.NackDiscard;
    } finally {
      process.stdout.write("> ");
    }
  };
}

export function handlerWar(
  gs: GameState,
  ch: ConfirmChannel,
  publishLog: (
    ch: ConfirmChannel,
    username: string,
    message: string,
  ) => Promise<void>,
): (rw: RecognitionOfWar) => Promise<AckType> {
  return async (rw: RecognitionOfWar) => {
    try {
      const outcome = handleWar(gs, rw);

      if (outcome.result === WarOutcome.NotInvolved) {
        return AckType.NackRequeue;
      } else if (outcome.result === WarOutcome.NoUnits) {
        return AckType.NackDiscard;
      } else if (outcome.result === WarOutcome.OpponentWon) {
        const msg = `${outcome.winner} won a war against ${outcome.loser}`;
        try {
          await publishLog(ch, rw.attacker.username, msg);
          return AckType.Ack;
        } catch (err) {
          console.log("Error publishing game log", err);
        }
        return AckType.NackRequeue;
      } else if (outcome.result === WarOutcome.YouWon) {
        const msg = `${outcome.winner} won a war against ${outcome.loser}`;
        try {
          await publishLog(ch, rw.attacker.username, msg);
          return AckType.Ack;
        } catch (err) {
          console.log("Error publishing game log", err);
        }
        return AckType.NackRequeue;
      } else if (outcome.result === WarOutcome.Draw) {
        const msg = `A war between ${outcome.attacker} and ${outcome.defender} resulted in a draw`;
        try {
          await publishLog(ch, rw.attacker.username, msg);
          return AckType.Ack;
        } catch (err) {
          console.log("Error publishing game log", err);
        }
        return AckType.NackRequeue;
      } else {
        console.error("Unknown WarOutcome:", outcome);
        return AckType.NackDiscard;
      }
    } finally {
      process.stdout.write("> ");
    }
  };
}
