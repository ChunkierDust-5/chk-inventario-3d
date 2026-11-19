// index.js (Versión unificada y definitiva con Historial)
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// Resolver la ruta de uploads en el userData de Electron para evitar errores ENOENT en el .exe
let uploadDir;
try {
  const electron = require('electron');
  const appElectron = electron.app || (electron.remote && electron.remote.app);
  if (appElectron) {
    uploadDir = path.join(appElectron.getPath('userData'), 'uploads');
  } else {
    uploadDir = path.join(__dirname, 'uploads');
  }
} catch (err) {
  uploadDir = path.join(__dirname, 'uploads');
}

// Asegurar que la carpeta uploads exista físicamente
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Hacer pública la carpeta de imágenes
app.use('/uploads', express.static(uploadDir));

// Servir la interfaz web y los archivos estáticos desde la misma carpeta del proyecto
app.use(express.static(__dirname));

// Ruta principal para servir el index.html automáticamente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Configuración de Multer apuntando al directorio seguro de uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// ==========================================
// ENDPOINTS DE LA API (SQLite)
// ==========================================

// 1. Obtener todos los carretes (Inventario Completo)
app.get('/api/carretes', (req, res) => {
  try {
    const carretes = db.prepare('SELECT * FROM carretes ORDER BY id ASC').all();
    res.json(carretes);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 2. Obtener el Catálogo Adaptativo
app.get('/api/catalogo', (req, res) => {
  try {
    const catalogo = db.prepare('SELECT * FROM vista_catalogo_imprimible ORDER BY id ASC').all();
    res.json(catalogo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 3. Obtener el Historial de Trabajos e Impresiones
app.get('/api/trabajos', (req, res) => {
  try {
    const trabajos = db.prepare(`
      SELECT 
        t.id, 
        t.nombre_pieza, 
        t.masa_estimada_g, 
        t.estado_trabajo, 
        t.fecha, 
        c.marca, 
        c.tipo_material, 
        c.color,
        m.masa_descontada_g,
        m.porcentaje_falla
      FROM trabajos t
      LEFT JOIN carretes c ON t.carrete_id = c.id
      LEFT JOIN mermas_fallas m ON t.id = m.trabajo_id
      ORDER BY t.id DESC
    `).all();
    res.json(trabajos);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener el historial de trabajos' });
  }
});

// 4. Registrar un nuevo carrete
app.post('/api/carretes', upload.single('imagen'), (req, res) => {
  try {
    const { marca, tipo_material, material, color, peso_inicial_g, peso_g } = req.body;
    const matFinal = tipo_material || material;
    const pesoFinal = parseFloat(peso_inicial_g || peso_g);
    const imagen_url = req.file ? `/uploads/${req.file.filename}` : null;

    const stmt = db.prepare(`
      INSERT INTO carretes (marca, tipo_material, color, peso_inicial_g, stock_actual_g, imagen_url, estado) 
      VALUES (?, ?, ?, ?, ?, ?, 'Disponible')
    `);
    const info = stmt.run(marca, matFinal, color, pesoFinal, pesoFinal, imagen_url);
    
    const nuevoCarrete = db.prepare('SELECT * FROM carretes WHERE id = ?').get(info.lastInsertRowid);
    res.json(nuevoCarrete);
  } catch (err) {
    console.error("Error detallado al guardar carrete:", err.message);
    res.status(500).json({ error: 'Error al guardar el carrete: ' + err.message });
  }
});

// 5. Registrar un trabajo con cálculo de faltante y descuento de stock
app.post('/api/trabajos', (req, res) => {
  try {
    const { nombre_pieza, carrete_id, masa_estimada_g, es_fallo, porcentaje_falla } = req.body;

    const carrete = db.prepare('SELECT stock_actual_g, color, tipo_material, marca FROM carretes WHERE id = ?').get(carrete_id);
    
    if (!carrete) {
      return res.status(404).json({ error: 'El carrete seleccionado no existe.' });
    }

    const stockActual = parseFloat(carrete.stock_actual_g);
    const masaRequerida = parseFloat(masa_estimada_g);

    if (masaRequerida > stockActual) {
      const faltante = (masaRequerida - stockActual).toFixed(2);
      return res.status(400).json({
        exito: false,
        mensaje: 'Material insuficiente para realizar la impresión.',
        carrete: `${carrete.marca} - ${carrete.tipo_material} ${carrete.color}`,
        stock_disponible_g: stockActual,
        masa_requerida_g: masaRequerida,
        faltante_g: parseFloat(faltante)
      });
    }

    let masa_consumida = masaRequerida;
    if (es_fallo && porcentaje_falla) {
      masa_consumida = masaRequerida * (parseFloat(porcentaje_falla) / 100);
    }

    const ejecutarTrabajo = db.transaction(() => {
      const stmtTrabajo = db.prepare(`
        INSERT INTO trabajos (nombre_pieza, carrete_id, masa_estimada_g, estado_trabajo) 
        VALUES (?, ?, ?, ?)
      `);
      const infoTrabajo = stmtTrabajo.run(nombre_pieza, carrete_id, masaRequerida, es_fallo ? 'Fallido' : 'Completado');
      const trabajoId = infoTrabajo.lastInsertRowid;

      if (es_fallo) {
        const stmtMerma = db.prepare(`
          INSERT INTO mermas_fallas (trabajo_id, porcentaje_falla, masa_descontada_g) 
          VALUES (?, ?, ?)
        `);
        stmtMerma.run(trabajoId, porcentaje_falla, masa_consumida);
      }

      const nuevoStock = Math.max(0, stockActual - masa_consumida);
      const nuevoEstado = nuevoStock <= 0 ? 'Agotado' : 'Disponible';

      const stmtUpdate = db.prepare(`
        UPDATE carretes 
        SET stock_actual_g = ?, estado = ? 
        WHERE id = ?
      `);
      stmtUpdate.run(nuevoStock, nuevoEstado, carrete_id);
    });

    ejecutarTrabajo();

    res.json({
      exito: true,
      mensaje: 'Trabajo registrado e inventario descontado exitosamente.',
      masa_descontada_g: masa_consumida
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno al procesar el trabajo' });
  }
});

// 6. Actualizar stock y/o imagen de un carrete
app.put('/api/carretes/:id', upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const { stock_actual_g } = req.body;

  try {
    const carreteActual = db.prepare('SELECT * FROM carretes WHERE id = ?').get(id);
    if (!carreteActual) {
      return res.status(404).json({ error: 'Carrete no encontrado' });
    }

    const nuevoPeso = stock_actual_g !== undefined && stock_actual_g !== '' ? parseFloat(stock_actual_g) : carreteActual.stock_actual_g;
    const nuevoEstado = nuevoPeso <= 0 ? 'Agotado' : 'Disponible';
    const nuevaImagenUrl = req.file ? `/uploads/${req.file.filename}` : carreteActual.imagen_url;

    db.prepare(`
      UPDATE carretes 
      SET stock_actual_g = ?, 
          imagen_url = ?,
          estado = ?
      WHERE id = ?
    `).run(nuevoPeso, nuevaImagenUrl, nuevoEstado, id);

    const carreteActualizado = db.prepare('SELECT * FROM carretes WHERE id = ?').get(id);
    res.json({ exito: true, mensaje: 'Carrete actualizado correctamente', carrete: carreteActualizado });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar el carrete' });
  }
});

// 7. Eliminar un carrete
app.delete('/api/carretes/:id', (req, res) => {
  const { id } = req.params;

  try {
    const carrete = db.prepare('SELECT * FROM carretes WHERE id = ?').get(id);
    if (!carrete) {
      return res.status(404).json({ error: 'Carrete no encontrado' });
    }

    db.prepare('DELETE FROM carretes WHERE id = ?').run(id);
    res.json({ exito: true, mensaje: 'Carrete eliminado correctamente' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al eliminar el carrete de la base de datos' });
  }
});

// Iniciar servidor local
app.listen(3000, () => {
  console.log('Servidor CHK corriendo en http://localhost:3000 con SQLite');
});