terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.0"
    }
  }
}

provider "azurerm" {
  features {}

  # The Storage Account has shared key access disabled, so the provider can't
  # fetch an account key to manage the table - it uses Entra ID instead.
  storage_use_azuread = true
}

module "app-service-servicebus" {
  source = "../../modules/app-service-servicebus"

  name_prefix = "locally-example-servicebus"
  location    = "berlin"
  tags = {
    ProvisionedVia = "Terraform"
  }
}
