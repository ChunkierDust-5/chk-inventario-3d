# CHK - Current Holdings Keeper

## Descripción general del proyecto
**CHK (Current Holdings Keeper)** es una aplicación de escritorio multiplataforma (enfocada en Windows) diseñada para la gestión integral de insumos y control de producción en talleres de impresión 3D. Permite administrar el inventario de carretes de filamento, filtrar automáticamente un catálogo imprimible según la disponibilidad real de material, calcular déficits antes de iniciar una impresión, descontar mermas por fallos parciales y mantener un historial detallado de los trabajos realizados.

---

## Tecnologías y dependencias utilizadas

- **Entorno de ejecución y servidor:** Node.js y Express.js (`express`, `cors`) para la API REST local y el servicio de archivos estáticos.
- **Aplicación de escritorio:** Electron (`electron`, `electron-builder`) para el empaquetado como ejecutable independiente (`.exe`).
- **Base de datos:** SQLite mediante `better-sqlite3`, con soporte de integridad referencial (`PRAGMA foreign_keys = ON`) y vistas SQL.
- **Gestión de archivos e imágenes:** `multer` para la carga y almacenamiento local de fotografías de los carretes.
- **Frontend:** HTML5, CSS3 (con estilos `@media print` para exportación limpia a PDF) y JavaScript Vanilla (ES6+).

---

## Requisitos de instalación

- **Para ejecutar en modo desarrollo o compilar:**
  - Sistema operativo Windows 10/11 (64 bits), macOS o Linux.
  - [Node.js](https://nodejs.org/) (v18.x o superior recomendado) y `npm`.
  - Herramientas de compilación nativa de C++ (requeridas por `better-sqlite3` para reconstrucciones nativas, como *Windows Build Tools* o Visual Studio C++ Build Tools).
- **Para uso final (versión empaquetada):**
  - Sistema operativo Windows 10/11 (no requiere tener Node.js ni dependencias instaladas previamente).

---

## Instrucciones para configurar y ejecutar el sistema

### 1. Clonar el repositorio
```bash
git clone https://github.com/ChunkierDust-5/chk-inventario-3d.git
cd chk-inventario-3d
```

### 2. Instalar dependencias
```bash
npm install
```
*(Si `better-sqlite3` presenta conflicto de versión al empaquetar con Electron, ejecuta `npx electron-rebuild`).*

### 3. Ejecutar en entorno de desarrollo
Para iniciar la aplicación de escritorio completa con Electron:
```bash
npm start
```
*(Alternativamente, puedes iniciar únicamente el servidor backend ejecutando `node index.js` y abrir `http://localhost:3000` en tu navegador).*

### 4. Generar el ejecutable para Windows (`.exe`)
```bash
npm run build:win
```
El instalador generado se ubicará dentro de la carpeta `dist/`.

---

## Estructura general del proyecto

```text
chk-inventario-3d/
├── main.js             # Proceso principal de Electron (ventana y ciclo de vida)
├── index.js            # Servidor Express, configuración de Multer y endpoints de la API
├── db.js               # Conexión SQLite, definición de tablas, reglas CASCADE y vistas
├── index.html          # Interfaz gráfica completa (Catálogo, Inventario, Formularios e Historial)
├── logo.ico            # Ícono oficial de la aplicación
├── package.json        # Metadatos, dependencias y scripts de compilación
├── package-lock.json   # Árbol exacto de versiones de dependencias
└── .gitignore          # Exclusión de node_modules, dist/, bases de datos locales y uploads
```

---

## Limitaciones o consideraciones técnicas relevantes

- **Persistencia local de datos:** Cuando se ejecuta como `.exe` empaquetado, tanto la base de datos SQLite (`inventario.db`) como la carpeta de imágenes (`uploads/`) se almacenan automáticamente en el directorio `userData` del sistema operativo (por ejemplo, `%APPDATA%\chk-inventario-3d`) para evitar errores de permisos o rutas `ENOENT` dentro del paquete `asar`.
- **Umbral del catálogo imprimible:** La vista SQL `vista_catalogo_imprimible` filtra de manera automática cualquier carrete cuyo stock actual sea menor a **50 gramos**, ocultándolo de la pestaña de catálogo sin eliminarlo del inventario general.
- **Eliminación en cascada (`ON DELETE CASCADE`):** La base de datos opera con claves foráneas activas (`PRAGMA foreign_keys = ON`). Eliminar un carrete del inventario borrará automáticamente todos los registros asociados a dicho carrete en las tablas `trabajos` y `mermas_fallas`.
- **Puerto fijo local:** El servidor interno de Express escucha por defecto en el puerto `3000` (`http://localhost:3000`), por lo que este puerto debe estar libre al abrir la aplicación.
- **Almacenamiento sin nube:** El sistema está diseñado para operar de forma 100% local y offline; los respaldos de inventario deben realizarse copiando manualmente el archivo `.db` y la carpeta `uploads/` desde el directorio `userData`.
