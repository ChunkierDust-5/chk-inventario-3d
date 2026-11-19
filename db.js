// db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;

try {
  // Si estamos corriendo dentro de Electron, usamos la ruta segura de usuario
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'inventario.db');
} catch (e) {
  // Si estamos corriendo con 'node index.js' en desarrollo, usamos la carpeta local
  dbPath = path.join(__dirname, 'inventario.db');
}

// Asegurar que el directorio de la base de datos exista
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// IMPORTANTE: Habilitar explícitamente el soporte de claves foráneas en SQLite
db.pragma('foreign_keys = ON;');

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS carretes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marca TEXT NOT NULL,
    tipo_material TEXT NOT NULL,
    color TEXT NOT NULL,
    peso_inicial_g REAL NOT NULL,
    stock_actual_g REAL NOT NULL,
    imagen_url TEXT,
    estado TEXT DEFAULT 'Disponible'
  );

  CREATE TABLE IF NOT EXISTS trabajos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_pieza TEXT NOT NULL,
    carrete_id INTEGER,
    masa_estimada_g REAL NOT NULL,
    estado_trabajo TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (carrete_id) REFERENCES carretes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mermas_fallas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER,
    porcentaje_falla REAL NOT NULL,
    masa_descontada_g REAL NOT NULL,
    FOREIGN KEY (trabajo_id) REFERENCES trabajos(id) ON DELETE CASCADE
  );
`);

// Vista para el catálogo (filtrando carretes con menos de 50g)
try {
  db.exec(`
    DROP VIEW IF EXISTS vista_catalogo_imprimible;
    CREATE VIEW vista_catalogo_imprimible AS
    SELECT * FROM carretes WHERE stock_actual_g >= 50;
  `);
} catch (err) {
  console.error("Error al actualizar la vista del catálogo:", err.message);
}

module.exports = db;