# n8n - Custom Nodes & Workflows (Instinct Robotics)

Questa repository contiene la configurazione di **n8n** per Instinct Robotics, con supporto a **nodi custom** e **workflow per robotica**.

## 🚀 Come lanciare n8n

Esistono due modi per avviare l'ambiente: tramite comando Docker diretto o tramite Docker Compose.

### Opzione 1: Docker Compose (Raccomandato)

Usa il file `docker-compose.yaml` incluso per gestire n8n e i nodi custom in modo persistente.

#### Lancio n8n modificato (Locale)
Per lanciare la versione modificata di n8n (compilata localmente in `n8n`):
1. Compila n8n nella repository `n8n`:
   ```bash
   nvm use 22 && pnpm build:n8n
   ```
2. Imposta i permessi per la cartella dei dati:
   ```bash
   sudo chown -R 1000:1000 n8n_data
   ```
3. Lancia il servizio `n8n-local`:
   ```bash
   sudo docker compose up -d n8n-local
   ```

Il servizio sarà accessibile su `http://localhost:5678`.

---

## 🛠️ Nodi Custom

La cartella `custom_nodes/` contiene lo starter kit per creare i nodi personalizzati.

### Build dei Nodi
```bash
cd custom_nodes
npm install
npm run build
```

---

![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n – The Platform for AI Agents and Workflow Automation

Fair-code platform to build and deploy AI agents and workflows. Combine a visual canvas with custom code, run it self-hosted or in the [cloud](https://app.n8n.cloud/login), and connect to 1500+ integrations. AI automation you can trust with real work, from prototype to production.

![n8n.io - Screenshot](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-screenshot-readme.png)

## Key Capabilities

- **AI-Native Automation Platform**: Build and operationalize AI workflows and multi-step agents using your own data, models, and tools
- **Model Flexibility, No Lock-In**: Connect to OpenAI, Anthropic, Google, or open-source models and switch providers without changing your architecture
- **From Prototype to Production**: Design multi-step AI workflows with logic, tool use, human approvals, and full observability
- **Code When You Need It**: Combine visual building with JavaScript, Python, and npm packages for advanced AI workflows
- **Enterprise-Ready AI**: Self-host or deploy securely with role-based access, audit trails, and support for sensitive data
- **Leverage What Already Exists**: 1500+ integrations and 9,000+ workflow [templates](https://n8n.io/workflows) to connect AI with your existing systems

## Resources

- 📚 [Documentation](https://docs.n8n.io)
- 🔧 [1500+ Integrations](https://n8n.io/integrations)
- 💡 [Example Workflows](https://n8n.io/workflows)
- 🤖 [AI & LangChain Guide](https://docs.n8n.io/advanced-ai/)
- 👥 [Community Forum](https://community.n8n.io)
- 📖 [Community Tutorials](https://community.n8n.io/c/tutorials/28)
