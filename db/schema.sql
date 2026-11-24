CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  correo TEXT UNIQUE NOT NULL,
  clave_hash TEXT NOT NULL,
  cargo TEXT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono VARCHAR(20),
  correo VARCHAR(100),
  ruc VARCHAR(11)
);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS correo VARCHAR(100);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ruc VARCHAR(11);
CREATE UNIQUE INDEX IF NOT EXISTS proveedores_ruc_uq ON proveedores (ruc);

CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria_id INT NOT NULL REFERENCES categorias(id),
  proveedor_id INT REFERENCES proveedores(id),
  cantidad NUMERIC NOT NULL,
  unidad TEXT NOT NULL,
  precio_unitario NUMERIC NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  stock_minimo NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS perdidas (
  id                 INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_nombre    VARCHAR(100)  NOT NULL,
  cantidad           NUMERIC(10,2) NOT NULL,
  unidad             VARCHAR(10)   NOT NULL,
  monto_perdido      NUMERIC(10,2) NOT NULL,
  fecha_vencimiento  DATE NOT NULL,
  eliminado_por      INT REFERENCES usuarios(id) ON DELETE SET NULL,
  eliminado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  producto_nombre VARCHAR(200) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad NUMERIC NOT NULL,
  stock_anterior NUMERIC NOT NULL,
  stock_nuevo NUMERIC NOT NULL,
  motivo VARCHAR(200),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimientos_producto_idx ON movimientos (producto_id, creado_en DESC);
