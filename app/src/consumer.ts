import express, { Request, Response } from "express";
import { ServiceBusClient, ServiceBusReceivedMessage } from "@azure/service-bus";
import { TableClient } from "@azure/data-tables";
import { ManagedIdentityEndpointCredential, SERVICEBUS_SCOPE, STORAGE_SCOPE, summariseToken } from "./identity";
import { Message } from "./producer";
import { errorHandler, escapeHtml, handle, renderPage, renderTokenSummary, required, servicebusHostname } from "./web";

// Every message lands in one partition: this is a demo, not a high-volume store.
const PARTITION_KEY = "messages";

interface StoredMessage {
  partitionKey: string;
  rowKey: string;
  text: string;
  messageId: string;
  sentAt: string;
  enqueuedAt: string;
  storedAt: string;
}

// Table Storage returns entities in RowKey order, so a key that counts down
// over time lists the newest first. It's derived from when Service Bus enqueued
// the message (which doesn't change on redelivery) plus its ID, so a redelivered
// message overwrites its earlier row rather than being stored twice.
function rowKeyFor(message: ServiceBusReceivedMessage): string {
  const enqueued = message.enqueuedTimeUtc?.getTime() ?? Date.now();
  const descending = (8_640_000_000_000_000 - enqueued).toString().padStart(16, "0");
  return `${descending}-${message.messageId}`;
}

export async function runConsumer(port: number): Promise<void> {
  const queue = required("SERVICEBUS_QUEUE");
  const tableName = required("TABLE_NAME");

  // One credential serves both services: it asks the managed identity endpoint
  // for a Service Bus token or a Storage token, depending on who's asking.
  const credential = new ManagedIdentityEndpointCredential(process.env.AZURE_CLIENT_ID);
  const table = new TableClient(required("TABLE_ENDPOINT"), tableName, credential);
  const client = new ServiceBusClient(servicebusHostname(), credential);
  const receiver = client.createReceiver(queue);

  // Messages are completed only once the handler resolves - i.e. once the row
  // is written. If the write throws, the message is abandoned and redelivered
  // (up to the queue's max delivery count, then dead-lettered).
  receiver.subscribe({
    processMessage: async (message) => {
      const body = message.body as Message;
      const entity: StoredMessage = {
        partitionKey: PARTITION_KEY,
        rowKey: rowKeyFor(message),
        text: String(body.text ?? ""),
        messageId: String(message.messageId ?? ""),
        sentAt: String(body.sentAt ?? ""),
        enqueuedAt: message.enqueuedTimeUtc?.toISOString() ?? "",
        storedAt: new Date().toISOString(),
      };
      await table.upsertEntity(entity, "Replace");
      console.log(`stored message ${entity.messageId} in table ${tableName}`);
    },
    processError: async (args) => {
      console.error(`error from ${args.errorSource} receiving from queue ${queue}:`, args.error);
    },
  });

  const app = express();

  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).send("ok");
  });

  app.get("/", handle(async (_req, res) => {
    const rows: StoredMessage[] = [];
    let listError: Error | undefined;
    try {
      // Bound the read, so the page reports an unreachable table rather than
      // hanging while the client retries.
      const entities = table.listEntities<StoredMessage>({ abortSignal: AbortSignal.timeout(10_000) });
      for await (const entity of entities) {
        rows.push(entity);
        if (rows.length >= 50) {
          break;
        }
      }
    } catch (err) {
      listError = err as Error;
    }

    const [servicebusToken, storageToken] = await Promise.all(
      [SERVICEBUS_SCOPE, STORAGE_SCOPE].map((scope) =>
        credential
          .getToken(scope)
          .then((t) => summariseToken(t.token))
          .catch((err: Error) => err),
      ),
    );

    const items = rows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.text)}<br><small><code>${escapeHtml(row.messageId)}</code></small></td>
          <td><small>${escapeHtml(row.sentAt)}</small></td>
          <td><small>${escapeHtml(row.storedAt)}</small></td>
        </tr>`,
      )
      .join("");

    const body = `
      <h1>Consumer</h1>
      <p class="flow">producer &rarr; Service Bus queue <code>${escapeHtml(queue)}</code> &rarr; consumer (managed identity endpoint &rarr; Entra token) &rarr; <strong>Table Storage table <code>${escapeHtml(tableName)}</code></strong></p>
      <p>The newest 50 messages stored in the table. This page refreshes every 3 seconds.</p>
      ${listError ? `<p class="error">Couldn't read the table: ${escapeHtml(listError.message)}</p>` : ""}
      <table>
        <thead><tr><th>Message</th><th>Sent</th><th>Stored</th></tr></thead>
        <tbody>${items || `<tr><td colspan="3">No messages yet - send one from the producer.</td></tr>`}</tbody>
      </table>
      ${renderTokenSummary("Entra token for Service Bus (from the managed identity endpoint)", servicebusToken)}
      ${renderTokenSummary("Entra token for Table Storage (from the managed identity endpoint)", storageToken)}`;
    res.send(renderPage("Consumer", body, 3));
  }));

  app.use(errorHandler);

  app.listen(port, "0.0.0.0", () => {
    console.log(`consumer listening on 0.0.0.0:${port}, receiving from queue ${queue} into table ${tableName}`);
  });
}
