# n8n - Custom Nodes & Workflows

Questa repository contiene la configurazione per lanciare **n8n** tramite Docker, insieme alla gestione di **nodi custom** e **workflow**.

## 🚀 Come lanciare n8n

Esistono due modi per avviare l'ambiente: tramite comando Docker diretto o tramite Docker Compose.

### Opzione 1: Docker Compose (Raccomandato)

Usa il file `docker-compose.yaml` incluso per gestire n8n e i nodi custom in modo persistente.

#### Lancio n8n ufficiale
1. Assicurati di aver buildato i nodi custom (vedi sezione sotto).
2. Imposta i permessi per la cartella dei dati:
   ```bash
   sudo chown -R 1000:1000 n8n_data
   ```
3. Lancia il comando con sudo:
   ```bash
   sudo docker compose up -d n8n
   ```

#### Lancio n8n modificato (Locale)
Per lanciare la versione modificata di n8n (compilata localmente in `n8n-workflow`):
1. Compila n8n nella repository `n8n-workflow`:
   ```bash
   cd ../n8n-workflow
   nvm use 22 && pnpm build:n8n
   ```
2. Imposta i permessi per la cartella dei dati nella cartella `n8n`:
   ```bash
   cd ../n8n
   sudo chown -R 1000:1000 n8n_data
   ```
3. Lancia il servizio `n8n-local`:
   ```bash
   sudo docker compose up -d n8n-local
   ```

Il servizio sarà accessibile su `http://localhost:5678`.

### Opzione 2: Comando Docker Diretto

Se preferisci lanciare n8n manualmente:

```bash
sudo docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  --add-host=host.docker.internal:host-gateway \
  -v ~/.n8n:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

---

## 🛠️ Nodi Custom

La cartella `custom_nodes/` contiene lo starter kit per creare i tuoi nodi personalizzati.

### 1. Prerequisiti
- **Node.js** (v22 o superiore)
- **npm**

### 2. Installazione e Sviluppo
Spostati nella cartella dei nodi e installa le dipendenze:
```bash
cd custom_nodes
npm install
```

Per creare un nuovo pacchetto di nodi da zero:
```bash
npm create @n8n/node
```

### 3. Build dei Nodi
Prima di avviare n8n con Docker Compose, devi compilare i nodi:
```bash
npm run build
```
Questo genererà la cartella `dist/`, che viene automaticamente mappata nel container Docker tramite il volume configurato in `docker-compose.yaml`.

### 4. Integrazione nel Docker
In `docker-compose.yaml`, i nodi buildati vengono collegati così:
```yaml
volumes:
  - ./n8n_data:/home/node/.n8n
  - ./custom_nodes/dist:/home/node/.n8n/custom/n8n-nodes-robot-controller
```
- `./n8n_data`: Cartella locale per i dati di n8n (database, workflow salvati, ecc.).
- `./custom_nodes/dist`: Mappa i tuoi nodi compilati direttamente nella cartella delle estensioni di n8n.

---

## 📂 Struttura del Progetto
- `docker-compose.yaml`: Configurazione dell'ambiente Docker.
- `custom_nodes/`: Sorgenti dei nodi personalizzati.
- `n8n_data/`: (Generata automaticamente) Dati persistenti di n8n.
