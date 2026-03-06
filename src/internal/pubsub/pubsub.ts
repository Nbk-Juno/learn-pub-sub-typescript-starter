import type { ConfirmChannel, Channel } from "amqplib";
import amqp from "amqplib";
import { ExchangePerilDeadLetter } from "../routing/routing.js";
import { encode } from "@msgpack/msgpack";

export async function publishJSON<T>(
  ch: ConfirmChannel,
  exchange: string,
  routingKey: string,
  value: T,
): Promise<void> {
  const serialValue = Buffer.from(JSON.stringify(value));

  ch.publish(exchange, routingKey, serialValue, {
    contentType: "application/json",
  });
}

export async function publishMsgPack<T>(
  ch: ConfirmChannel,
  exchange: string,
  routingKey: string,
  value: T,
): Promise<void> {
  const serialValue = Buffer.from(encode(value));

  ch.publish(exchange, routingKey, serialValue, {
    contentType: "application/x-msgpack",
  });
}

export enum SimpleQueueType {
  Durable,
  Transient,
}

export enum AckType {
  Ack,
  NackRequeue,
  NackDiscard,
}

export async function declareAndBind(
  conn: amqp.ChannelModel,
  exchange: string,
  queueName: string,
  key: string,
  queueType: SimpleQueueType,
): Promise<[Channel, amqp.Replies.AssertQueue]> {
  const ch = await conn.createChannel();
  const isDurable: boolean = queueType === SimpleQueueType.Durable;
  const isTransient: boolean = queueType === SimpleQueueType.Transient;

  const q = await ch.assertQueue(queueName, {
    durable: isDurable,
    autoDelete: isTransient,
    exclusive: isTransient,
    arguments: {
      "x-dead-letter-exchange": ExchangePerilDeadLetter,
    },
  });

  await ch.bindQueue(q.queue, exchange, key);

  return [ch, q];
}

export async function subscribeJSON<T>(
  conn: amqp.ChannelModel,
  exchange: string,
  queueName: string,
  key: string,
  queueType: SimpleQueueType,
  handler: (data: T) => Promise<AckType> | AckType,
): Promise<void> {
  const [ch, q] = await declareAndBind(
    conn,
    exchange,
    queueName,
    key,
    queueType,
  );

  ch.consume(q.queue, async function (msg: amqp.ConsumeMessage | null) {
    if (!msg) {
      return;
    }

    const message = JSON.parse(msg.content.toString());

    const ackType = await handler(message);

    if (ackType === AckType.Ack) {
      ch.ack(msg);
      console.log("Message Acknowledged");
    } else if (ackType === AckType.NackRequeue) {
      ch.nack(msg, false, true);
      console.log("Message Negative Acknowledged requeuing");
    } else if (ackType === AckType.NackDiscard) {
      ch.nack(msg, false, false);
      console.log("Message Negative Acknowledged discard");
    }
  });
}
