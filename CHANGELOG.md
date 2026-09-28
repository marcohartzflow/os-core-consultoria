# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões seguem SemVer. A seção "Ação necessária no fork" diz o que um fork de cliente precisa fazer ao trazer a versão.

## [Unreleased]

### Adicionado

- Base do OS Core: monorepo (Spring Boot 4.1 + Next.js 16), módulos `common`, `auth`, `iam`, `ai` e o exemplo `tasks`.
- Sessão no servidor (Spring Session JDBC), CSRF, Argon2id, lockout, rate limit por IP, limite de sessões simultâneas, revogação imediata.
- Convite por e-mail, redefinição de senha, roles, catálogo de permissões gerado das anotações, guardas contra escalação de privilégio e remoção do último administrador.
- Troca de senha obrigatória para o administrador criado pelo bootstrap.
- Agente de IA com tools filtradas por permissão, confirmação humana para ações destrutivas, auditoria de cada chamada e streaming token a token.
- Trilha de auditoria consultável e exportável em CSV.
- Direitos do titular (LGPD art. 18): exportação dos próprios dados e anonimização de conta desativada.
- Envio de e-mail por SMTP quando configurado.
- Segundo fator (TOTP + códigos de recuperação), obrigatório para administradores.
- Deploy de referência com Docker Compose e Caddy, backup, CI com build das imagens, CD por SSH para forks.

### Ação necessária no fork

- Primeira versão; nada a migrar.
