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
## Veredicto: 🚫 NO LISTO PARA LANZAR

Lánzalo hoy y tres de estos te muerden el primer día.

## 🔥 Arregla esto primero
🔴 Tu clave de OpenAI está metida en el bundle del navegador (app/page.tsx:5) — cualquiera
   abre DevTools y gasta tu crédito.
🔴 Row Level Security está apagado en `orders` — ahora mismo cualquier visitante puede leer
   los pedidos de todos los clientes.
🔴 /api/chat llama a una API de pago sin login y sin límite de tasa — un bot de una noche
   es una factura de $200.

## Acceso a datos
🟢 El bucket de subidas es privado, servido a través de URLs firmadas — revisado, limpio.
🟡 No se pudo confirmar RLS en la base de datos en vivo desde el código — tus migraciones lo
   activan; abre el panel de Supabase y verifícalo de nuevo.
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

Veo una app Next.js + Supabase. Corriendo la auditoría previa al lanzamiento — alrededor de un minuto.
…
Veredicto: 🚫 no está listo para lanzar. Tres cosas te morderían el primer día. ¿Las arreglamos juntos?

> sí

La primera es la que da miedo: tu clave de OpenAI está en el bundle del frontend — cualquiera puede leerla y
gastar tu crédito. Voy a mover la llamada a una ruta de servidor y leer la clave desde una variable solo de
servidor. ¿Aplico esto?

> adelante

Listo — la clave ya no está en el cliente y la página sigue compilando. Ese es el riesgo de la factura de $200 cerrado.
Sigue: Row Level Security en `orders`…
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
Funciona en macOS, Windows y Linux — en Windows los escáneres opcionales se instalan a través de `winget`/`scoop`
en lugar de `brew`, y `/ship-check` se encarga de eso por ti.

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

Las entrañas del plugin están escritas en inglés; el reporte y la conversación salen en el
idioma del usuario en tiempo de ejecución.

## Contribuir

Los issues y pull requests son bienvenidos — especialmente una revisión que falte, un falso positivo, o un nuevo
patrón de corrección para un stack que las referencias todavía no cubren. Abre un issue con el código que lo disparó.

## Créditos

El checklist previo al lanzamiento que inspiró esto es de [@PrajwalTomar_](https://x.com/PrajwalTomar_/status/2059612250047209957).

## Licencia

MIT — ver [LICENSE](LICENSE).
