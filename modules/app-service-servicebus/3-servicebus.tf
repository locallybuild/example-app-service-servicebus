# ---------------------------------------------------------------------------
# Service Bus - the queue the producer sends to and the consumer receives from.
#
# Local (SAS key) authentication is disabled, so there's no connection string
# to leak: the only way in is an Entra access token, which each app obtains
# from the App Service managed identity endpoint.
# ---------------------------------------------------------------------------
resource "azurerm_servicebus_namespace" "main" {
  name                = "${var.name_prefix}-bus"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
  local_auth_enabled  = false
  tags                = var.tags
}

resource "azurerm_servicebus_queue" "messages" {
  name         = "messages"
  namespace_id = azurerm_servicebus_namespace.main.id

  # A message that fails processing this many times is moved to the
  # dead-letter sub-queue rather than being retried forever.
  max_delivery_count = 5
}

# ---------------------------------------------------------------------------
# Data-plane role assignments, scoped to the queue rather than the namespace.
# ---------------------------------------------------------------------------
resource "azurerm_role_assignment" "producer_sender" {
  scope                = azurerm_servicebus_queue.messages.id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = azurerm_user_assigned_identity.producer.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "consumer_receiver" {
  scope                = azurerm_servicebus_queue.messages.id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = azurerm_user_assigned_identity.consumer.principal_id
  principal_type       = "ServicePrincipal"
}
