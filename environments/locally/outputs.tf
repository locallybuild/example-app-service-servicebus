output "producer_url" {
  description = "Where to reach the producer (send messages) in a browser."
  value       = module.app-service-servicebus.producer_url
}

output "consumer_url" {
  description = "Where to reach the consumer (stored messages) in a browser."
  value       = module.app-service-servicebus.consumer_url
}

output "servicebus_namespace" {
  description = "The Service Bus namespace the producer sends to."
  value       = module.app-service-servicebus.servicebus_namespace
}

output "storage_account" {
  description = "The Storage Account whose table the consumer writes to."
  value       = module.app-service-servicebus.storage_account
}
