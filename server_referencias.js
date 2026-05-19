// ─────────────────────────────────────────────────────────────────
//  BD Referencias ICO  —  Backend Express + MySQL
//  Instalar: npm install express mysql2 cors uuid
//  Correr:   node server_referencias.js
// ─────────────────────────────────────────────────────────────────
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');

const app  = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'bd_referencias_ico',
  waitForConnections: true,
  connectionLimit: 10,
});

pool.getConnection()
  .then(c => { console.log('✅ MySQL BD Referencias conectado'); c.release(); })
  .catch(e => console.error('❌ Error MySQL:', e.message));

// ── GET /api/areas  — Lista de áreas de estudio
app.get('/api/areas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM area_estudio ORDER BY id_area');
    res.json({ ok: true, areas: rows });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GET /api/materias?area=1  — Materias (opcionalmente filtradas por área)
app.get('/api/materias', async (req, res) => {
  try {
    const where = req.query.area ? 'WHERE m.id_area=?' : '';
    const params = req.query.area ? [req.query.area] : [];
    const [rows] = await pool.query(
      `SELECT m.*, ae.nombre AS nombre_area
       FROM materia m JOIN area_estudio ae ON m.id_area=ae.id_area
       ${where} ORDER BY ae.id_area, m.nombre`, params);
    res.json({ ok: true, materias: rows });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GET /api/tipos  — Tipos de referencia
app.get('/api/tipos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tipo_referencia ORDER BY id_tipo');
    res.json({ ok: true, tipos: rows });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GET /api/obras  — Búsqueda de obras
// Query params: q (texto libre), area, materia, tipo, anio_desde, anio_hasta, limit, offset
app.get('/api/obras', async (req, res) => {
  try {
    const { q, area, materia, tipo, anio_desde, anio_hasta, limit=20, offset=0 } = req.query;
    let where = ['1=1'];
    let params = [];

    if (q) {
      where.push('(o.titulo LIKE ? OR a_concat.autores LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (area) {
      where.push('ae.id_area = ?');
      params.push(area);
    }
    if (materia) {
      where.push('m.id_materia = ?');
      params.push(materia);
    }
    if (tipo) {
      where.push('t.id_tipo = ?');
      params.push(tipo);
    }
    if (anio_desde) { where.push('o.anio >= ?'); params.push(anio_desde); }
    if (anio_hasta) { where.push('o.anio <= ?'); params.push(anio_hasta); }

    const whereStr = where.join(' AND ');

    const sql = `
      SELECT o.id_obra, o.titulo, o.anio, o.editorial, o.vol, o.num,
             o.pags, o.edicion, o.pais, o.institucion, o.url, o.doi,
             t.nombre AS tipo,
             COALESCE(a_concat.autores,'') AS autores,
             COALESCE(m.nombre,'') AS materia,
             COALESCE(ae.nombre,'') AS area
      FROM obra o
      JOIN tipo_referencia t ON o.id_tipo = t.id_tipo
      LEFT JOIN (
        SELECT oa.id_obra,
               GROUP_CONCAT(a.nombre_completo ORDER BY oa.orden SEPARATOR '; ') AS autores
        FROM obra_autor oa JOIN autor a ON oa.id_autor=a.id_autor
        GROUP BY oa.id_obra
      ) a_concat ON o.id_obra = a_concat.id_obra
      LEFT JOIN obra_materia om ON o.id_obra = om.id_obra
      LEFT JOIN materia m ON om.id_materia = m.id_materia
      LEFT JOIN area_estudio ae ON m.id_area = ae.id_area
      WHERE ${whereStr}
      GROUP BY o.id_obra
      ORDER BY o.anio DESC, o.titulo ASC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));

    const sqlCount = `
      SELECT COUNT(DISTINCT o.id_obra) AS total
      FROM obra o
      JOIN tipo_referencia t ON o.id_tipo = t.id_tipo
      LEFT JOIN (SELECT oa.id_obra, GROUP_CONCAT(a.nombre_completo SEPARATOR '; ') AS autores
                 FROM obra_autor oa JOIN autor a ON oa.id_autor=a.id_autor GROUP BY oa.id_obra) a_concat
        ON o.id_obra=a_concat.id_obra
      LEFT JOIN obra_materia om ON o.id_obra=om.id_obra
      LEFT JOIN materia m ON om.id_materia=m.id_materia
      LEFT JOIN area_estudio ae ON m.id_area=ae.id_area
      WHERE ${whereStr}
    `;
    const [rows] = await pool.query(sql, params);
    const [countRows] = await pool.query(sqlCount, params.slice(0, -2));

    res.json({ ok: true, obras: rows, total: countRows[0].total });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GET /api/obras/:id  — Detalle de una obra
app.get('/api/obras/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT o.*, t.nombre AS tipo,
             GROUP_CONCAT(a.nombre_completo ORDER BY oa.orden SEPARATOR '; ') AS autores,
             GROUP_CONCAT(DISTINCT m.nombre SEPARATOR ', ') AS materias,
             GROUP_CONCAT(DISTINCT ae.nombre SEPARATOR ', ') AS areas
      FROM obra o
      JOIN tipo_referencia t ON o.id_tipo=t.id_tipo
      LEFT JOIN obra_autor oa ON o.id_obra=oa.id_obra
      LEFT JOIN autor a ON oa.id_autor=a.id_autor
      LEFT JOIN obra_materia om ON o.id_obra=om.id_obra
      LEFT JOIN materia m ON om.id_materia=m.id_materia
      LEFT JOIN area_estudio ae ON m.id_area=ae.id_area
      WHERE o.id_obra=?
      GROUP BY o.id_obra`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Obra no encontrada' });
    res.json({ ok: true, obra: rows[0] });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── POST /api/obras  — Crear nueva obra
app.post('/api/obras', async (req, res) => {
  const { titulo, autores, anio, editorial, vol, num, pags, edicion,
          pais, institucion, url, doi, id_tipo, id_materias } = req.body;
  if (!titulo) return res.status(400).json({ ok: false, msg: 'El título es requerido' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO obra (titulo,anio,editorial,vol,num,pags,edicion,pais,institucion,url,doi,id_tipo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [titulo,anio||null,editorial||null,vol||null,num||null,pags||null,
       edicion||null,pais||null,institucion||null,url||null,doi||null,id_tipo||1]
    );
    const obra_id = ins.insertId;

    if (autores && autores.length) {
      for (let i=0; i<autores.length; i++) {
        const nombre = autores[i].trim();
        if (!nombre) continue;
        let [arows] = await conn.query(
          'SELECT id_autor FROM autor WHERE nombre_completo=?', [nombre]);
        let aid;
        if (!arows.length) {
          const [ains] = await conn.query('INSERT INTO autor (nombre_completo) VALUES (?)', [nombre]);
          aid = ains.insertId;
        } else { aid = arows[0].id_autor; }
        await conn.query('INSERT INTO obra_autor (id_obra,id_autor,orden) VALUES (?,?,?)',
          [obra_id, aid, i+1]);
      }
    }
    if (id_materias && id_materias.length) {
      for (const mid of id_materias) {
        await conn.query('INSERT IGNORE INTO obra_materia VALUES (?,?)', [obra_id, mid]);
      }
    }
    await conn.commit();
    res.json({ ok: true, id_obra: obra_id, msg: 'Obra registrada correctamente' });
  } catch(e) {
    await conn.rollback();
    res.status(500).json({ ok: false, msg: e.message });
  } finally { conn.release(); }
});

// ── PUT /api/obras/:id  — Actualizar obra
app.put('/api/obras/:id', async (req, res) => {
  const { titulo, anio, editorial, vol, num, pags, edicion,
          pais, institucion, url, doi, id_tipo } = req.body;
  try {
    await pool.query(
      `UPDATE obra SET titulo=?,anio=?,editorial=?,vol=?,num=?,pags=?,
       edicion=?,pais=?,institucion=?,url=?,doi=?,id_tipo=? WHERE id_obra=?`,
      [titulo,anio||null,editorial||null,vol||null,num||null,pags||null,
       edicion||null,pais||null,institucion||null,url||null,doi||null,
       id_tipo||1,req.params.id]
    );
    res.json({ ok: true, msg: 'Obra actualizada' });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── DELETE /api/obras/:id  — Eliminar obra
app.delete('/api/obras/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM obra WHERE id_obra=?', [req.params.id]);
    res.json({ ok: true, msg: 'Obra eliminada' });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── POST /api/historial  — Guardar cita generada
app.post('/api/historial', async (req, res) => {
  const { id_obra, formato, cita_generada, sesion_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO historial_cita (id_obra,formato,cita_generada,sesion_id) VALUES (?,?,?,?)',
      [id_obra, formato, cita_generada, sesion_id||null]);
    res.json({ ok: true, msg: 'Guardado en historial' });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GET /api/historial?sesion_id=xxx  — Historial de la sesión
app.get('/api/historial', async (req, res) => {
  try {
    const where = req.query.sesion_id ? 'WHERE h.sesion_id=?' : '';
    const params = req.query.sesion_id ? [req.query.sesion_id] : [];
    const [rows] = await pool.query(
      `SELECT h.id_historial, h.formato, h.cita_generada, h.fecha,
              o.titulo, o.anio,
              COALESCE(a_c.autores,'') AS autores
       FROM historial_cita h
       JOIN obra o ON h.id_obra=o.id_obra
       LEFT JOIN (SELECT oa.id_obra, GROUP_CONCAT(a.nombre_completo ORDER BY oa.orden SEPARATOR '; ') AS autores
                  FROM obra_autor oa JOIN autor a ON oa.id_autor=a.id_autor GROUP BY oa.id_obra) a_c
         ON o.id_obra=a_c.id_obra
       ${where}
       ORDER BY h.fecha DESC LIMIT 100`, params);
    res.json({ ok: true, historial: rows });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── DELETE /api/historial/:id
app.delete('/api/historial/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM historial_cita WHERE id_historial=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.listen(PORT, () => console.log(`🚀 Referencias API corriendo en http://localhost:${PORT}`));
