import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import { ServiceBusClient } from "@azure/service-bus";
import { ManagedIdentityEndpointCredential, SERVICEBUS_SCOPE, summariseToken } from "./identity";
import { errorHandler, escapeHtml, handle, renderPage, renderTokenSummary, required, servicebusHostname } from "./web";

// The message the producer sends and the consumer stores.
export interface Message {
  text: string;
  sentAt: string;
}

export async function runProducer(port: number): Promise<void> {
  const queue = required("SERVICEBUS_QUEUE");
  const consumerUrl = process.env.CONSUMER_URL;

  // The credential calls the managed identity endpoint for a token whenever
  // the Service Bus client needs one - there's no connection string or SAS key.
  const credential = new ManagedIdentityEndpointCredential(process.env.AZURE_CLIENT_ID);
  const client = new ServiceBusClient(servicebusHostname(), credential);
  const sender = client.createSender(queue);

  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).send("ok");
  });

  app.get("/", handle(async (req, res) => {
    // Fetch (or reuse) the same token the Service Bus client sends, to show its claims.
    const summary = await credential
      .getToken(SERVICEBUS_SCOPE)
      .then((t) => summariseToken(t.token))
      .catch((err: Error) => err);

    const sent = typeof req.query.sent === "string" ? req.query.sent : undefined;
    const body = `
      <h1>Producer</h1>
      <p class="flow">App Service &rarr; managed identity endpoint &rarr; Entra token &rarr; <strong>Service Bus queue <code>${escapeHtml(queue)}</code></strong> &rarr; consumer &rarr; Table Storage</p>
      ${sent ? `<p class="notice">Sent message <code>${escapeHtml(sent)}</code>.${consumerUrl ? ` <a href="${escapeHtml(consumerUrl)}">See it arrive at the consumer &rarr;</a>` : ""}</p>` : ""}
      <form class="send" method="post" action="/send">
        <input name="text" placeholder="Write a message..." required maxlength="1000" autofocus>
        <button type="submit">Send</button>
      </form>
      ${consumerUrl ? `<p><a href="${escapeHtml(consumerUrl)}">Open the consumer</a> to see stored messages.</p>` : ""}
      ${renderTokenSummary("Entra token for Service Bus (from the managed identity endpoint)", summary)}`;
    res.send(renderPage("Producer", body));
  }));

  app.post("/send", handle(async (req, res) => {
    const text = String(req.body.text ?? "").trim();
    if (!text) {
      res.redirect(303, "/");
      return;
    }
    const messageId = randomUUID();
    const message: Message = { text, sentAt: new Date().toISOString() };
    await sender.sendMessages(
      { messageId, body: message, contentType: "application/json" },
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    console.log(`sent message ${messageId} to queue ${queue}`);
    res.redirect(303, `/?sent=${encodeURIComponent(messageId)}`);
  }));

  app.use(errorHandler);

  app.listen(port, "0.0.0.0", () => {
    console.log(`producer listening on 0.0.0.0:${port}, sending to queue ${queue} on ${servicebusHostname()}`);
  });
}
