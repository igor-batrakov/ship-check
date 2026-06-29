# ship-check

[English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md) | **Español** | [Português](README.pt.md)

**Una auditoría de seguridad previa al lanzamiento para apps hechas con vibe coding.** Un solo comando — `/ship-check` — encuentra los agujeros
que provocan facturas sorpresa de $200, bots de spam y cartas de cese y desista, y luego te guía por las
correcciones una a una. Te responde en tu idioma.

> Hecho para quienes recién empiezan. Le hablas con palabras simples; él hace la revisión, explica
> cada riesgo en términos de lo que te cuesta, y arregla las cosas con tu aprobación. Sin herramientas
> extra que instalar, sin comandos que memorizar.

## Inicio rápido

En la raíz de tu proyecto, ejecuta:

```
/ship-check
```

Detecta tu stack, corre la auditoría, escribe un reporte `PROD-AUDIT.md` y se ofrece a arreglar los
problemas contigo — un cambio a la vez, con tu visto bueno.

## Cómo se ve un reporte

`/ship-check` escribe `PROD-AUDIT.md` con el veredicto arriba y las cosas que te muerden primero:

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

Cada revisión cae en uno de tres estados:

- 🔴 **problema encontrado** — un agujero concreto, con el archivo y la línea.
- 🟢 **revisado — limpio** — la revisión corrió y el código está bien.
- 🟡 **no se pudo verificar** — revísalo a mano (falta una herramienta, se necesita una URL en vivo, o es una
  revisión de comportamiento). 🟡 se queda en 🟡; la auditoría te dirá qué mirar en lugar de adivinar.

Ese honesto tercer estado es el punto: una herramienta que imprime ✅ mientras está ciega es peor que no tener herramienta.

## Una sesión de ejemplo

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

## Qué revisa

Cinco áreas más cumplimiento — el checklist original del vibe coder, con algunos agujeros extra comunes:

- **🔑 Secretos y filtraciones** — claves en el frontend, secretos en `.env`/git/logs, APIs que devuelven
  demasiado, errores internos mostrados a los usuarios.
- **🗄️ Acceso a datos** — Row Level Security (RLS), acceso a las filas de otras personas (IDOR), claves de servicio
  que saltan tus revisiones, almacenamiento de archivos público por defecto.
- **🔐 Robustez de la autenticación** — bloqueo por contraseña incorrecta, un reseteo para un correo que no existe, un
  registro duplicado (un checklist de navegador que haces clic a clic).
- **🛡️ Seguridad web (OWASP)** — headers, inyección SQL, XSS, validación del lado del servidor, modo debug
  dejado activo en producción.
- **💸 Abuso y costo** — llamadas sin protección a APIs de pago (el riesgo de los "$200 de la noche a la mañana"), límites de tasa,
  CAPTCHA en formularios, CORS.
- **⚖️ Cumplimiento** — política de privacidad, GDPR/CCPA, dónde viven tus datos, con una plantilla inicial.

## Requisitos

Solo Claude Code — la auditoría corre con herramientas integradas y no necesita configuración extra. Los escaneos
más profundos son opcionales y se ofrecen sobre la marcha: cuando una herramienta como `gitleaks` (escanea tu
historial de git en busca de claves filtradas) o `semgrep` (cobertura más amplia de inyección/XSS) ayudaría,
`/ship-check` se ofrece a configurarla por ti, con tu aprobación. Sáltala y esas revisiones se quedan en 🟡 "no se
pudo verificar". Un MCP como context7, cuando lo tienes, afina las sugerencias de corrección; nunca es obligatorio.

## Instalación

Desde Claude Code:

```
/plugin marketplace add igor-batrakov/ship-check
/plugin install ship-check@ship-check-tools
```

Luego ejecuta `/ship-check` en cualquier proyecto. (¿Alojas tu propio fork? Apunta el primer comando a tu repo.)

## Límites

- **El servidor está fuera de alcance.** Firewall, una base de datos expuesta a internet, correr como root,
  SSH — eso es la capa del servidor; la skill `new-vps-setup` se encarga de eso.
- **Es un punto de partida en cumplimiento, con un abogado para el resto.** El paso de cumplimiento da un
  checklist y un borrador de política de privacidad marcado "que lo revise un abogado".
- **Es una base, con un pentest para mayor profundidad.** Esto detecta los agujeros comunes previos al lanzamiento. Una app
  seria igual va a querer una revisión de seguridad de verdad.

## Para desarrolladores de plugins

- `skills/production-audit/SKILL.md` — el orquestador (el cerebro).
- `agents/*.md` — cinco agentes auditores ligeros; la lógica de detección vive en `references/`.
- `skills/production-audit/references/` — los checklists profundos por dominio (la única fuente de verdad).
- `tests/fixtures/` y `tests/synthetic/` — apps deliberadamente vulnerables y mayormente seguras;
  `tests/RESULTS.md` y `tests/SYNTHETIC.md` registran cómo se desempeña la auditoría en ellas (el control de calidad).
- Diseño y plan: `docs/`.

Las entrañas del plugin están escritas en inglés; el reporte y la conversación salen en el
idioma del usuario en tiempo de ejecución.

## Contribuir

Los issues y pull requests son bienvenidos — especialmente una revisión que falte, un falso positivo, o un nuevo
patrón de corrección para un stack que las referencias todavía no cubren. Abre un issue con el código que lo disparó.

## Créditos

El checklist previo al lanzamiento que inspiró esto es de [@PrajwalTomar_](https://x.com/PrajwalTomar_/status/2059612250047209957).

## Licencia

MIT — ver [LICENSE](LICENSE).
