# ---------------------------------------------------------------------------
# Storage Account - the consumer writes each message it receives into a table.
#
# Shared key access is disabled, so the consumer authenticates with an Entra
# access token for its managed identity rather than an account key.
# ---------------------------------------------------------------------------
resource "azurerm_storage_account" "main" {
  name                            = substr(replace(var.name_prefix, "-", ""), 0, 24)
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  allow_nested_items_to_be_public = false
  tags                            = var.tags
}

resource "azurerm_storage_table" "messages" {
  name               = "messages"
  storage_account_id = azurerm_storage_account.main.id
}

# ---------------------------------------------------------------------------
# Data-plane role assignment - lets the consumer read and write table entities.
# ---------------------------------------------------------------------------
resource "azurerm_role_assignment" "consumer_tables" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_user_assigned_identity.consumer.principal_id
  principal_type       = "ServicePrincipal"
}
