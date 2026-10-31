locals {
  # The application image, built from ../../app and pushed into the Locally
  # Container Registry by 5-container-registry.tf.
  image_name = "app-service-servicebus"

  # The image is tagged with a hash of the application directory, so any change
  # to the app produces a new tag: that re-triggers the build and push, and rolls
  # both App Services onto the freshly built image. Build artifacts are excluded
  # so they don't churn the hash.
  app_dir = "${path.module}/../../app"
  app_files = [
    for f in fileset(local.app_dir, "**") : f
    if !startswith(f, "node_modules/") && !startswith(f, "dist/")
  ]
  image_tag = substr(sha1(join(",", [for f in local.app_files : "${f}:${filesha1("${local.app_dir}/${f}")}"])), 0, 12)

  # The port the container listens on inside App Service (the app's PORT, exposed
  # to App Service as WEBSITES_PORT). App Service terminates TLS at the platform
  # and routes public traffic to the container on this port.
  app_port = 8080
}
