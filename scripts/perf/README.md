# Medição de desempenho

Mede as listagens do portal com volume realista, por HTTP, contra uma instância **local**. Resultados e regras em `docs/performance.md`.

1. Crie um banco vazio e suba a API apontando para ele, numa porta própria. O administrador de carga não tem segundo fator nem troca de senha obrigatória, o que só se faz localmente:

   ```bash
   docker exec -i api-postgres-1 psql -U os -d os -c "CREATE DATABASE os_perf;"
   java -jar apps/api/build/libs/os-api-0.0.1-SNAPSHOT.jar --spring.profiles.active=local \
     --spring.datasource.url=jdbc:postgresql://localhost:5432/os_perf --spring.datasource.username=os \
     --spring.datasource.password=os --spring.docker.compose.enabled=false --server.port=18090 \
     --os.iam.mfa.require-for-system-role=false --os.iam.bootstrap.require-password-change=false \
     --os.iam.bootstrap.admin-email=admin@example.com --os.iam.bootstrap.admin-password=<senha-local>
   ```

2. Com a API no ar (as migrations já rodaram), preencha. Volumes e gerador de id são variáveis; `uuidv7` é o que a API usa:

   ```bash
   docker exec -i api-postgres-1 psql -U os -d os_perf -v users=5000 -v tasks=200000 -v events=3000000 \
     -v idfn=uuidv7 < scripts/perf/seed.sql
   docker exec -i api-postgres-1 psql -U os -d os_perf -At < scripts/perf/params.sql > /tmp/params.json
   ```

3. Meça (mediana e p95 de 20 execuções após 3 de aquecimento):

   ```bash
   OS_PERF_PASSWORD=<senha-local> node scripts/perf/run.mjs --api http://localhost:18090 \
     --params /tmp/params.json --out /tmp/resultado.json
   ```

4. Espaço e custo de escrita da auditoria:

   ```bash
   docker exec -i api-postgres-1 psql -U os -d os_perf -v idfn=uuidv7 < scripts/perf/metrics.sql
   ```

Não use um navegador logado no portal de desenvolvimento para abrir essa API: cookies de `localhost` valem para todas as portas, e o login de carga substituiria a sua sessão.
