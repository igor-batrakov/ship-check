# ship-check

[English](README.md) | [Русский](README.ru.md) | **中文** | [Español](README.es.md) | [Português](README.pt.md)

**一款给 vibe-coded 应用做上线前安全审计的工具。** 一条命令 —— `/ship-check` —— 帮你找出那些会导致
200 美元意外账单、垃圾机器人和律师函的漏洞，然后一步一步带着你把它们修好。它会用你的语言回复。

> 专为刚起步的人打造。你用大白话和它说话，它来做检查，按照"这会让你付出什么代价"来解释每一个风险，
> 并在你同意后帮你修复。不用额外装工具，也不用背命令。

## 快速开始

在你项目的根目录下，运行：

```
/ship-check
```

它会识别你的技术栈，跑一遍审计，写出一份 `PROD-AUDIT.md` 报告，并提出和你一起修复这些问题 ——
一次改一处，每一步都先征得你的同意。

## 报告长什么样

`/ship-check` 会写一份 `PROD-AUDIT.md`，把结论放在最上面，并列出那些最先咬到你的问题：

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

每一项检查最终都会落到三种状态之一：

- 🔴 **发现问题** —— 一个实实在在的漏洞，附带文件和行号。
- 🟢 **已检查 —— 没问题** —— 检查跑过了，代码没问题。
- 🟡 **无法确认** —— 需要你手动核实（缺少某个工具、需要一个线上 URL，或者这是个行为类检查）。
  🟡 就保持是 🟡；审计会告诉你该去看哪里，而不是瞎猜。

那个诚实的第三种状态正是关键所在：一个明明看不见却还打印 ✅ 的工具，比没有工具更糟糕。

## 一次会话示例

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

## 它会检查什么

五大领域外加合规 —— 最初为 vibe-coder 准备的检查清单，再加上几个常见的额外漏洞：

- **🔑 密钥与泄露** —— 前端里的密钥、藏在 `.env`/git/日志里的密钥、返回太多内容的 API、
  把内部错误显示给用户。
- **🗄️ 数据访问** —— Row Level Security (RLS)、能访问到别人的数据行 (IDOR)、绕过你检查的
  service key、默认对外公开的文件存储。
- **🔐 认证健壮性** —— 密码输错时的锁定、为不存在的邮箱发起重置、重复注册（一份你点着走的浏览器检查清单）。
- **🛡️ Web 安全 (OWASP)** —— 响应头、SQL 注入、XSS、服务端校验、生产环境里忘了关的 debug 模式。
- **💸 滥用与成本** —— 对付费 API 的无保护调用（即"一夜 200 美元"的风险）、限流、表单上的 CAPTCHA、CORS。
- **⚖️ 合规** —— 隐私政策、GDPR/CCPA、你的数据存放在哪里，并附一份入门模板。

## 环境要求

只需要 Claude Code —— 审计运行在内置工具上，无需任何额外配置。更深入的扫描是可选的，会在需要时
当场提供：当 `gitleaks`（扫描你的 git 历史，查找泄露的密钥）或 `semgrep`（覆盖更广的注入/XSS）
这类工具能派上用场时，`/ship-check` 会在征得你同意后帮你把它装好。跳过它，那些检查就会保持
🟡"无法确认"。如果你装了 context7 这样的 MCP，它能让修复建议更精准；但它从来都不是必需的。

## 安装

在 Claude Code 里：

```
/plugin marketplace add igor-batrakov/ship-check
/plugin install ship-check@ship-check-tools
```

然后在任意项目里运行 `/ship-check`。（想托管自己的 fork？把第一条命令指向你自己的仓库即可。）

## 边界

- **服务器不在范围内。** 防火墙、暴露在公网的数据库、以 root 身份运行、SSH —— 这些属于服务器层面；
  那部分由 `new-vps-setup` 这个 skill 负责。
- **它是合规的起点，剩下的交给律师。** 合规这一关会给你一份清单和一份草拟的隐私政策，
  上面标注着"请让律师审阅"。
- **它是基线，深入则要靠渗透测试。** 它能抓住上线前常见的漏洞。一个认真的应用仍然需要
  一次真正的安全审查。

## 给插件开发者

- `skills/production-audit/SKILL.md` —— 编排器（大脑）。
- `agents/*.md` —— 五个轻量的审计 agent；检测逻辑都放在 `references/` 里。
- `skills/production-audit/references/` —— 各领域的深度检查清单（唯一的事实来源）。
- `tests/fixtures/` 和 `tests/synthetic/` —— 故意做成有漏洞的应用，以及基本安全的应用；
  `tests/RESULTS.md` 和 `tests/SYNTHETIC.md` 记录了审计在它们身上的表现（质量门槛）。
- 设计与方案：`docs/`。

插件的内部实现是用英文写的；报告和对话会在运行时以用户的语言输出。

## 参与贡献

欢迎提 issue 和 pull request —— 尤其是某个漏掉的检查、某个误报，或者某个 references
还没覆盖的技术栈的新修复方案。开一个 issue，附上触发它的代码。

## 致谢

激发这个项目的那份上线前检查清单来自 [@PrajwalTomar_](https://x.com/PrajwalTomar_/status/2059612250047209957)。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
