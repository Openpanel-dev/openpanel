#!/bin/bash
set -e

echo "> Replace env variable placeholders with runtime values..."
# Define an array of environment variables to check
variables_to_replace=(
  "NEXT_PUBLIC_DASHBOARD_URL"
  "NEXT_PUBLIC_API_URL"
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
)

# Replace env variable placeholders with real values
for key in "${variables_to_replace[@]}"; do
  value=$(printenv $key)
  if [ ! -z "$value" ]; then
    echo "  - Searching for $key with value $value..."
    # Use a custom placeholder for 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY' or use the actual key otherwise
    if [ "$key" = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then
      placeholder="pk_test_eW9sby5jb20k"
    else
      placeholder="__${key}__"
    fi
    # Run the replacement
    find /app/apps/dashboard/.next/ -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|$placeholder|$value|g" {} \;

  else
    echo "  - Skipping $key as it has no value set."
  fi
done

# Execute the container's main process (CMD in Dockerfile)
exec "$@"