#!/bin/bash

# Accept self-signed certificates (for local development only)
export NODE_TLS_REJECT_UNAUTHORIZED=0

$HOME/.bun/bin/bun ./src/main.ts "$@"
