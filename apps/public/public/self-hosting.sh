#!/bin/bash

# Clone the Openpanel repository
git clone https://github.com/Openpanel-dev/openpanel.git

# Navigate to the self-hosting directory
cd openpanel/self-hosting

# Run the setup script
./setup

# Navigate back to the original directory
cd ../../

# Clean up by removing the downloaded script
rm -- "$0"
