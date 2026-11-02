```
ooooo                                      oooo  oooo              
`888'                                      `888  `888              
 888          .ooooo.   .ooooo.   .oooo.    888   888  oooo    ooo 
 888         d88' `88b d88' `"Y8 `P  )88b   888   888   `88.  .8'
 888         888   888 888        .oP"888   888   888    `88..8'
 888       o 888   888 888   .o8 d8(  888   888   888     `888'
o888ooooood8 `Y8bod8P' `Y8bod8P' `Y888""8o o888o o888o     .8'
                                                       .o..P'
                                                       `Y8P'
```

# Example: Pass messages from App Service through Service Bus into Table Storage within Locally

This example shows how two apps running on App Service can pass messages through an Azure Service Bus queue into Azure Table Storage on [Locally Build](https://locally.build). Neither app stores a key, connection string or password: each authenticates with its own **user-assigned managed identity**.

```
 producer (App Service)                         consumer (App Service)
   │                                               │
   ├─ GET $IDENTITY_ENDPOINT ─▶ Entra token        ├─ GET $IDENTITY_ENDPOINT ─▶ Entra token (Service Bus)
   │    (aud: servicebus.azure.net)                ├─ GET $IDENTITY_ENDPOINT ─▶ Entra token (Storage)
   │                                               │
   └─ send ─▶ Service Bus queue "messages" ─▶ receive
                                                   └─ upsert ─▶ Table Storage table "messages"
```

There are two apps, written in TypeScript (Node.js and Express). Both run from one image, and the `ROLE` app setting decides which one a container runs as. The source lives in [`app/`](./app), alongside the infrastructure that runs it.

* **producer** - a page where you type a message. Clicking Send puts it on the Service Bus queue.
* **consumer** - listens on the queue and writes each message it receives as an entity in a Table Storage table. It also serves a page listing the stored messages, which refreshes every few seconds.

### How the apps get their tokens

When a web app has a managed identity, App Service sets two environment variables in its container:

* `IDENTITY_ENDPOINT` - a local URL that issues Entra access tokens for that identity.
* `IDENTITY_HEADER` - a secret that must be sent with each request.

[`app/src/identity.ts`](./app/src/identity.ts) calls that endpoint directly: one HTTP `GET` asking for a token for a resource (`https://servicebus.azure.net` or `https://storage.azure.com`). It does this instead of using `DefaultAzureCredential` from `@azure/identity`, which makes the same call but hides it. The Service Bus and Table Storage clients accept the result as an ordinary `TokenCredential`. Each app's page shows the claims of the tokens it was issued (audience, issuer, object ID, expiry), but never the token itself.

### Least privilege

Each app has its own identity, and each identity has only the roles that app needs:

| Identity | Role | Scope |
| --- | --- | --- |
| producer | Azure Service Bus Data Sender | the `messages` queue |
| consumer | Azure Service Bus Data Receiver | the `messages` queue |
| consumer | Storage Table Data Contributor | the Storage Account |

Shared-key and SAS authentication are switched off on both the Service Bus namespace (`local_auth_enabled = false`) and the Storage Account (`shared_access_key_enabled = false`), so an Entra token is the only way in. Locally checks these roles the same way Azure does: if the consumer tries to send to the queue, it gets `UnauthorizedAccess: insufficient rights: Send required`.

## Requirements

* [Locally Build](https://locally.build).
* Either [HashiCorp Terraform](https://terraform.io) or [OpenTofu](https://opentofu.org).
* Either [Docker](https://www.docker.com) or [Podman](https://podman.io) (recommended).
* The Locally Plugin for `Microsoft.ServiceBus` installed (`locally plugin install --name Microsoft.ServiceBus`).
* The Locally Plugin for `Microsoft.Storage` installed (`locally plugin install --name Microsoft.Storage`).
* The Locally Plugin for `Microsoft.Web` installed (`locally plugin install --name Microsoft.Web`).
* The Locally Plugin for `Microsoft.ContainerRegistry` installed (`locally plugin install --name Microsoft.ContainerRegistry`).
* The Locally Plugin for `Microsoft.Insights` installed (`locally plugin install --name Microsoft.Insights`).
* The Locally Plugin for `Microsoft.OperationalInsights` installed (`locally plugin install --name Microsoft.OperationalInsights`).

## Running the example

First, make sure your container runtime (Docker or Podman) is running, then start Locally:

```bash
locally build
```

With Locally running, open another terminal and initialise Terraform. This downloads the providers and sets up the module:

```bash
cd environments/locally
terraform init
```

> [!NOTE]
> You can use OpenTofu instead by running `tofu` wherever this says `terraform`.

Once Terraform is initialised, provision the example:

```bash
locally run terraform apply
```

During the apply, Terraform builds the app with `docker build` and pushes it to the Container Registry, so the `docker` command needs to be available. With Podman, the `podman-docker` shim or a `docker` alias works.

After you approve the plan and the resources are deployed, both apps are running at the URLs in the outputs:

```
producer_url = "https://locally-example-servicebus-producer.furnace.locally:5663"
consumer_url = "https://locally-example-servicebus-consumer.furnace.locally:5663"
```

[Open the producer](https://locally-example-servicebus-producer.furnace.locally:5663) and send a message, then follow the link to [the consumer](https://locally-example-servicebus-consumer.furnace.locally:5663). The message appears there once the consumer has taken it off the queue and written it to the table.

---

You can also look at each step from the CLI. To peek at messages still on the queue (it's normally empty, because the consumer drains it straight away):

```bash
locally servicebus queue peek --namespace locally-example-servicebus-bus --name messages
```

Both apps send their logs to a Log Analytics Workspace. You can query them in [the Monitoring section of the Locally Dashboard](https://localhost:5678/monitoring/components) by running:

```
AppServiceConsoleLogs | order by TimeGenerated desc
```

## Notes

This example has no sign-in of its own: anyone who can reach the producer can send messages, and anyone who can reach the consumer can read them. That keeps the example focused on the identity → Service Bus → Table Storage wiring. A real app would sit behind authentication.

The consumer completes a message only after its row has been written. If the write fails, the message goes back on the queue and is retried. After 5 failed deliveries it moves to the dead-letter sub-queue. Each row's key comes from when the message was enqueued plus its ID, so a redelivered message overwrites its own row instead of being stored twice.

Because shared-key access is disabled on the Storage Account, the provider sets `storage_use_azuread = true` so that Terraform also uses Entra ID to manage the table.

## Tearing it down

```bash
cd environments/locally
locally run terraform destroy
```
