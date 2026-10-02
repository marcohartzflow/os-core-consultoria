-- A frase que o portal acrescenta à conversa quando uma ação pendente é resolvida. A memória de chat
-- do Spring AI (JDBC) guarda só texto, tipo e horário de cada mensagem, sem metadados; é por esta
-- coluna que a tela e a exportação (LGPD art. 18) separam as notas do portal do que a pessoa digitou.
ALTER TABLE ai_pending_action ADD COLUMN note TEXT;
