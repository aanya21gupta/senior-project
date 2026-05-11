#!/bin/bash
docker stop clinical-app 2>/dev/null && docker rm clinical-app 2>/dev/null \
  || echo "Container not running."
echo "Stopped."
