# Despliegue en Railway - DestructNote Backend

## Pasos para desplegar

### 1. Crear cuenta en Railway
1. Ve a [railway.app](https://railway.app)
2. Crea una cuenta (puedes usar GitHub)
3. El tier gratuito incluye $5 de crédito mensual (suficiente para esta app)

### 2. Crear nuevo proyecto
1. Click en "New Project"
2. Selecciona "Deploy from GitHub repo"
3. Conecta tu repositorio de GitHub

### 3. Añadir PostgreSQL
1. En tu proyecto, click en "New"
2. Selecciona "Database" → "Add PostgreSQL"
3. Railway creará automáticamente la variable `DATABASE_URL`

### 4. Configurar variables de entorno
En la pestaña "Variables" de tu servicio, añade:

```
PORT=3000
NODE_ENV=production
BETTER_AUTH_SECRET=tu-secreto-de-32-caracteres-minimo
BACKEND_URL=https://tu-app.railway.app
```

**IMPORTANTE**: `BACKEND_URL` debe ser la URL pública que Railway te asigna.

### 5. Preparar el código para Railway

Antes de subir a GitHub, necesitas hacer estos cambios en tu código local:

#### 5.1 Reemplazar schema.prisma
```bash
cp backend/railway/schema.prisma backend/prisma/schema.prisma
```

#### 5.2 Reemplazar db.ts
```bash
cp backend/railway/db.ts backend/src/db.ts
```

#### 5.3 Actualizar package.json
```bash
cp backend/railway/package.json backend/package.json
```

#### 5.4 Eliminar dependencias de Vibecode
En `backend/src/index.ts`, elimina la línea:
```typescript
import "@vibecodeapp/proxy"; // DO NOT REMOVE...
```

#### 5.5 Eliminar SQLite pragmas
El archivo `db.ts` ya está actualizado en `railway/db.ts`

### 6. Configurar el build en Railway
En Settings → Build:
- Build Command: `bun install && bunx prisma generate && bunx prisma migrate deploy`
- Start Command: `bun run src/index.ts`

### 7. Desplegar
1. Haz commit de todos los cambios
2. Push a GitHub
3. Railway detectará los cambios y desplegará automáticamente

### 8. Actualizar la app móvil
Una vez desplegado, actualiza en tu app:

En `src/lib/api.ts`, cambia:
```typescript
const BACKEND_URL = "https://tu-app.railway.app";
```

O mejor, usa una variable de entorno en `.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://tu-app.railway.app
```

---

## Archivos incluidos en esta carpeta

- `schema.prisma` - Schema de Prisma para PostgreSQL
- `package.json` - Dependencies sin las de Vibecode
- `db.ts` - Cliente de Prisma sin SQLite pragmas

## Notas importantes

1. **Base de datos**: Railway usa PostgreSQL, no SQLite
2. **URL estable**: Railway proporciona URLs estables tipo `https://tu-app.railway.app`
3. **SSL**: Railway maneja SSL automáticamente
4. **Tier gratuito**: $5/mes de crédito, suficiente para apps pequeñas
5. **Escalado**: Puedes escalar fácilmente si necesitas más recursos

## Alternativa: Render.com

Si prefieres Render:
1. Ve a [render.com](https://render.com)
2. Los pasos son similares
3. También tiene tier gratuito (pero con cold starts)
