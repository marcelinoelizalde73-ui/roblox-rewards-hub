# Roblox Rewards Hub (MVP)

## Ejecutar
1. Instala Node.js 20+.
2. Abre terminal en la carpeta y ejecuta `npm install`.
3. Copia `.env.example` a `.env`.
4. Cambia SESSION_SECRET, ROBLOX_GAME_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD.
5. Ejecuta `npm start` y abre http://localhost:3000.

## Conectar Roblox
1. Publica el backend en un servidor HTTPS.
2. Activa HTTP Requests en Roblox Studio > Game Settings > Security.
3. En `roblox/RewardsServer.lua`, cambia API y SECRET.
4. Coloca el Script en ServerScriptService.
5. En la web crea cuenta y genera código.
6. En tu juego escribe `/vincular CODIGO`.
7. Llama `awardMission(player, "id_mision")` desde una misión validada por el servidor.

## Incluye
- Registro e inicio de sesión.
- Base SQLite y puntos con historial.
- Código temporal para vincular Roblox UserId.
- API protegida para acreditar puntos desde el servidor Roblox.
- Tienda de premios internos, canjes y panel de administración.
- Reembolso de puntos cuando se rechaza un canje.

## Importante
Este MVP solo contiene premios internos de la experiencia. No implementa dinero, tarjetas regalo ni canje de Robux. Los puntos no son dinero. Antes de ofrecer recompensas externas, verifica las políticas vigentes de Roblox, las leyes aplicables y los términos de los proveedores. No prometas ni entregues premios que no estén financiados.

Para producción faltan: hosting HTTPS, correo verificado, recuperación de contraseña, protección CSRF, almacenamiento persistente de sesiones, copias de seguridad, monitoreo, auditoría y controles antifraude. No uses el servidor de desarrollo para datos reales. Nunca publiques tu secreto del juego ni lo pongas en LocalScripts.
