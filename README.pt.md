# ship-check

[English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md) | [Español](README.es.md) | **Português**

**Uma auditoria de segurança pré-lançamento para apps feitos no vibe coding.** Um comando — `/ship-check` — encontra os buracos
que causam contas-surpresa de US$ 200, bots de spam e notificações extrajudiciais, e depois te guia pelas
correções, uma de cada vez. Ele responde no seu idioma.

> Feito para quem está começando agora. Você fala com ele em palavras simples; ele faz a verificação, explica
> cada risco em termos do que ele te custa, e corrige as coisas com a sua aprovação. Sem ferramentas extras para
> instalar, sem comandos para decorar.

## Início rápido

Na raiz do seu projeto, rode:

```
/ship-check
```

Ele detecta a sua stack, roda a auditoria, escreve um relatório `PROD-AUDIT.md` e se oferece para corrigir os
problemas com você — uma mudança de cada vez, com o seu aval.

## Como é um relatório

O `/ship-check` escreve o `PROD-AUDIT.md` com o veredito no topo e as coisas que te pegam primeiro:

```
## Verdict: 🚫 NOT READY TO SHIP

Three issues can leak data or run up a bill the moment you launch.

## 🔥 Fix these first
🔴 Your OpenAI key ships in the browser bundle (app/page.tsx:5) — anyone opens
   DevTools and spends your credit.
🔴 Row Level Security is off on `orders` (supabase/migrations/0001_init.sql) — any
   visitor can read every customer's orders.
🔴 /api/chat calls a paid API with no login and no rate limit — a bot can run up a
   $200 bill overnight.

## Data access
🟢 Uploads bucket is private and served through signed URLs — checked, clean.
🟡 Couldn't confirm RLS in the live database — your migrations enable it; open the
   Supabase dashboard and verify.
```

Toda verificação cai em um de três estados:

- 🔴 **problema encontrado** — um buraco concreto, com o arquivo e a linha.
- 🟢 **verificado — limpo** — a verificação rodou e o código está bem.
- 🟡 **não foi possível verificar** — confira na mão (uma ferramenta está faltando, é preciso uma URL ao vivo, ou é uma
  verificação comportamental). 🟡 continua sendo 🟡; a auditoria vai te dizer o que olhar em vez de ficar chutando.

Esse terceiro estado honesto é o ponto central: uma ferramenta que imprime ✅ enquanto está cega é pior do que ferramenta nenhuma.

## Um exemplo de sessão

```
> /ship-check

I see a Next.js + Supabase app. Running the pre-launch audit — about a minute.
…
Verdict: 🚫 not ready to ship. Three things will bite you on day one. Fix them together?

> yes

First: your OpenAI key is in the frontend bundle, so anyone can read it and spend your credit.
I'll move the call to a server route and read the key from a server-only variable. Apply this?

> go ahead

Done — the key lives on the server now, and the page still builds. Next: Row Level Security…
```

## O que ele verifica

Cinco áreas mais conformidade — a checklist original do vibe coder, com alguns buracos comuns a mais:

- **🔑 Segredos e vazamentos** — chaves no frontend, segredos no `.env`/git/logs, APIs que retornam
  demais, erros internos mostrados aos usuários.
- **🗄️ Acesso aos dados** — Row Level Security (RLS), acesso às linhas de outras pessoas (IDOR), service keys
  que furam as suas verificações, armazenamento de arquivos público por padrão.
- **🔐 Robustez da autenticação** — bloqueio por senha errada, redefinição para um e-mail que não existe, um
  cadastro duplicado (uma checklist no navegador que você percorre clicando).
- **🛡️ Segurança web (OWASP)** — headers, injeção de SQL, XSS, validação no servidor, modo debug
  deixado ligado em produção.
- **💸 Abuso e custo** — chamadas desprotegidas a APIs pagas (o risco dos "US$ 200 da noite para o dia"), rate limiting,
  CAPTCHA em formulários, CORS.
- **⚖️ Conformidade** — política de privacidade, GDPR/CCPA, onde os seus dados ficam, com um modelo inicial.

## Requisitos

Apenas o Claude Code — a auditoria roda com ferramentas embutidas e não precisa de configuração extra. Verificações mais
profundas são opcionais e oferecidas na hora: quando uma ferramenta como `gitleaks` (vasculha o histórico do seu git em
busca de chaves vazadas) ou `semgrep` (cobertura mais ampla de injeção/XSS) seria útil, o `/ship-check` se oferece para
configurá-la para você, com a sua aprovação. Pule isso e essas verificações continuam 🟡 "não foi possível verificar". Um
MCP como o context7, quando você tem um, deixa as sugestões de correção mais afiadas; ele nunca é obrigatório.

## Instalação

A partir do Claude Code:

```
/plugin marketplace add igor-batrakov/ship-check
/plugin install ship-check@ship-check-tools
```

Depois rode `/ship-check` em qualquer projeto. (Hospedando o seu próprio fork? Aponte o primeiro comando para o seu repositório.)

## Limites

- **O servidor está fora do escopo.** Firewall, um banco de dados exposto à internet, rodar como root,
  SSH — isso é a camada do servidor; a skill `new-vps-setup` cobre isso.
- **É um ponto de partida em conformidade, com um advogado para o resto.** A etapa de conformidade entrega uma
  checklist e um rascunho de política de privacidade marcado com "peça para um advogado revisar".
- **É uma base, com um pentest para a profundidade.** Isto pega os buracos comuns de pré-lançamento. Um app
  sério ainda vai querer uma revisão de segurança de verdade.

## Para desenvolvedores de plugins

- `skills/production-audit/SKILL.md` — o orquestrador (o cérebro).
- `agents/*.md` — cinco agentes auditores enxutos; a lógica de detecção vive em `references/`.
- `skills/production-audit/references/` — as checklists detalhadas por domínio (a única fonte de verdade).
- `tests/fixtures/` e `tests/synthetic/` — apps deliberadamente vulneráveis e na maioria seguros;
  `tests/RESULTS.md` e `tests/SYNTHETIC.md` registram como a auditoria se sai neles (o portão de qualidade).
As entranhas do plugin são escritas em inglês; o relatório e a conversa saem no idioma do
usuário em tempo de execução.

## Contribuindo

Issues e pull requests são bem-vindos — especialmente uma verificação que faltou, um falso positivo, ou um novo
padrão de correção para uma stack que as references ainda não cobrem. Abra uma issue com o código que tropeçou nela.

## Créditos

O checklist de pré-lançamento que deu origem a isto é de [@PrajwalTomar_](https://x.com/PrajwalTomar_/status/2059612250047209957).

## Licença

MIT — veja [LICENSE](LICENSE).
