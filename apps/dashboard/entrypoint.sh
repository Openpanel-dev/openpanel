#!/bin/sh
set -e

echo "> Replace env variable placeholders with runtime values..."

# Define environment variables to check (space-separated string)
variables_to_replace="NEXT_PUBLIC_DASHBOARD_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_SELF_HOSTED"

# Replace env variable placeholders with real values
for key in $variables_to_replace; do
    value=$(eval echo \$"$key")
    if [ -n "$value" ]; then
        echo "  - Searching for $key with value $value..."
        # Use standard placeholder format for all variables
        placeholder="__${key}__"
        
        # Run the replacement
        find /app -type f \( -name "*.js" -o -name "*.html" \) | while read -r file; do
            if grep -q "$placeholder" "$file"; then
                echo "    - Replacing in file: $file"
                sed -i "s|$placeholder|$value|g" "$file"
            fi
        done
    else
        echo "  - Skipping $key as it has no value set."
    fi
done

echo "> Done!"
echo "> Running $@"

# Execute the container's main process (CMD in Dockerfile)
exec "$@"