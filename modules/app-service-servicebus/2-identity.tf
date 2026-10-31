# ---------------------------------------------------------------------------
# User-Assigned Managed Identities - one per app, so each holds only the
# permissions it needs:
#
#   * the producer can send to the queue, and nothing else.
#   * the consumer can receive from the queue and write to the table.
#
# User-assigned (rather than system-assigned) identities exist before the web
# apps do, so their role assignments are granted up front - each app has access
# from its very first request, rather than racing a grant that lands later.
# ---------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "producer" {
  name                = "${var.name_prefix}-producer-id"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = var.tags
}

resource "azurerm_user_assigned_identity" "consumer" {
  name                = "${var.name_prefix}-consumer-id"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = var.tags
}
