# Adaptador Claude opcional

La interfaz está conectada con POST `/api/claude/analyze`. El servidor usa únicamente `https://api.anthropic.com/v1/messages`, con credencial fuera del navegador, versión API 2023-06-01, modelo configurable, 12.000 caracteres de entrada y 100 a 1.000 tokens máximos de salida. Timeout 30 segundos, redirecciones rechazadas, sin herramientas, sin reintento automático y una petición por minuto por sesión. La respuesta no se aplica a HS ni revisiones; se muestra como propuesta.

Apagado por defecto. Para una activación posterior hacen falta aprobación de los datos y gasto, clave API por canal seguro, modelo habilitado en esa cuenta y límite de consumo decidido. Claude Pro no configura por sí mismo estas variables. Nombres: `CLAUDE_ENABLED`, `CLAUDE_DATA_APPROVED`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_MAX_OUTPUT_TOKENS`. No guardar valores en Git. `.env` está ignorado.

El usuario ve y confirma el texto exacto antes de cada transmisión. El backend exige sesión local y token CSRF. La confirmación del navegador no reemplaza la aprobación organizativa ni el control de gasto. El límite de tokens NO es un tope monetario ni diario: añadir cuota presupuestaria persistente y registro de uso antes de un despliegue compartido. No activar para datos reales hasta terminar esa revisión.

Pruebas actuales: transporte inyectado con respuesta ficticia, ningún proveedor contactado. Se verifica destino fijo, contenido exacto, falta de herramientas y bloqueo cuando está apagado o falta confirmación. Modo integrado simulado también probado en navegador. La ruta real de Claude está escrita, NO validada con una clave real ni consumo.

Fuentes:
- https://platform.claude.com/docs/en/api/messages
- https://platform.claude.com/docs/en/api/models/list
- https://platform.claude.com/docs/en/manage-claude/authentication
