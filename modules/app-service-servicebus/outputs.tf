output "producer_url" {
  description = "Where to reach the producer (send messages) in a browser."
  value       = "https://${azurerm_linux_web_app.producer.default_hostname}"
}

output "consumer_url" {
  description = "Where to reach the consumer (stored messages) in a browser."
  value       = "https://${azurerm_linux_web_app.consumer.default_hostname}"
}

output "resource_group" {
  description = "The resource group containing the deployed resources."
  value       = azurerm_resource_group.main.name
}

output "servicebus_namespace" {
  description = "The Service Bus namespace the producer sends to."
  value       = azurerm_servicebus_namespace.main.name
}

output "storage_account" {
  description = "The Storage Account whose table the consumer writes to."
  value       = azurerm_storage_account.main.name
}
