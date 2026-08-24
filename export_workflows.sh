#!/bin/bash
# Script per esportare i workflow correnti di n8n nella cartella 'workflows' tracciata da git.
set -e

echo "Esportazione dei workflow da n8n..."
sudo docker compose exec n8n n8n export:workflow --backup --output=/home/node/workflows/

echo "Workflow esportati con successo in 'workflows/'!"
echo "Stato attuale dei file:"
ls -la workflows/
