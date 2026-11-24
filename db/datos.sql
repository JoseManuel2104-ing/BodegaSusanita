-- Respaldo de datos generado el 2026-10-26T20:32:23.404Z
-- Se carga solo cuando la base de datos está vacía.

INSERT INTO "usuarios" ("id", "nombre", "correo", "clave_hash", "cargo", "creado_en") OVERRIDING SYSTEM VALUE VALUES
  (1, 'Administrador', 'admin123@gmail.com', '$2a$06$0ZmlBMaNKlZmRU3iynQOiOkhFTn1PArAT2nA9bv6ASc/BooPxEixK', 'administrador', '2026-10-06 01:16:34.028942'),
  (2, 'Jefe de almacén', 'almacen@gmail.com', '$2a$06$M7eRwL9F6DLmR0QSDr/twO.H8grckTlqeVQ2Fx/ZltcDkmSbpymV2', 'jefe de almacén', '2026-10-06 01:16:34.028942'),
  (3, 'Operario', 'operario@gmail.com', '$2a$06$g7U7JspC3kD0QUHMQMdtMOVrLAGvDV6oGqHAahiRPgbwAWng8zFea', 'operario', '2026-10-06 01:16:34.028942')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('usuarios', 'id'), (SELECT MAX(id) FROM "usuarios"));

INSERT INTO "categorias" ("id", "nombre") OVERRIDING SYSTEM VALUE VALUES
  (1, 'Lácteos'),
  (2, 'Abarrotes'),
  (3, 'Bebidas'),
  (4, 'Limpieza'),
  (6, 'Trigos')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('categorias', 'id'), (SELECT MAX(id) FROM "categorias"));

INSERT INTO "proveedores" ("id", "nombre", "telefono", "correo", "ruc") OVERRIDING SYSTEM VALUE VALUES
  (1, 'Proveedor General', '987654321', 'ventas@proveedorgeneral.com', '20512345678'),
  (2, 'Distribuidora Lima', '945123678', 'pedidos@distribuidoralima.com', '20498765432'),
  (3, 'GLORIA.SAC', '9823191231', 'gloria.sac.@gmail.com', NULL),
  (4, 'Gloria S.A.', NULL, 'ventas.gloria@example.com', '20100190797'),
  (5, 'Alicorp S.A.A.', NULL, 'ventas.alicorp@example.com', '20100055237'),
  (6, 'Backus y Johnston S.A.A.', NULL, 'ventas.backus@example.com', '20100113610'),
  (7, 'Arca Continental Lindley S.A.', NULL, 'ventas.lindley@example.com', '20101024645'),
  (8, 'Nestlé Perú S.A.', NULL, 'ventas.nestle@example.com', '20263322496'),
  (9, 'Compañía Nacional de Chocolates de Perú S.A.', NULL, 'ventas.costa@example.com', '20514584789'),
  (10, 'Panificadora Bimbo del Perú S.A.', NULL, 'ventas.bimbo@example.com', '20348735692'),
  (11, 'Molitalia S.A.', NULL, 'ventas.molitalia@example.com', '20100035121'),
  (12, 'Mondelez Perú S.A.', NULL, 'ventas.mondelez@example.com', '20100164010'),
  (13, 'Unilever Andina Perú S.A.', NULL, 'ventas.unilever@example.com', '20100003946'),
  (14, 'Laive S.A.', NULL, 'ventas.laive@example.com', '20100095450')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('proveedores', 'id'), (SELECT MAX(id) FROM "proveedores"));

INSERT INTO "productos" ("id", "nombre", "categoria_id", "proveedor_id", "cantidad", "unidad", "precio_unitario", "fecha_vencimiento", "stock_minimo") OVERRIDING SYSTEM VALUE VALUES
  (1, 'asdasda', 1, NULL, '12', 'lt', '12', '2026-12-12', '0'),
  (2, 'atun', 2, NULL, '12333', 'uni', '2.6', '2026-12-10', '0'),
  (3, 'arroz', 2, 2, '12', 'L', '3.1', '2027-12-11', '0'),
  (6, 'Arroz', 2, 2, '50', 'kg', '60', '2027-12-12', '0'),
  (7, 'Cereal para desayuno (caja)', 2, 8, '45', 'unid', '12.90', '2027-08-21', '15'),
  (8, 'Caldo concentrado (cubos)', 2, 8, '120', 'unid', '2.50', '2027-12-19', '40'),
  (9, 'Chocolate en barra 100 g', 2, 9, '90', 'unid', '4.50', '2027-06-22', '30'),
  (10, 'Galleta wafer (paquete)', 2, 9, '110', 'unid', '1.50', '2027-04-23', '40'),
  (11, 'Caramelos surtidos (bolsa)', 2, 9, '60', 'unid', '5.00', '2027-10-25', '20'),
  (12, 'Queque envasado (unidad)', 2, 10, '70', 'unid', '2.80', '2026-12-09', '25'),
  (13, 'Pan tostado (paquete)', 2, 10, '50', 'unid', '3.50', '2027-01-08', '20'),
  (14, 'Fideos tallarín 500 g', 2, 11, '130', 'unid', '2.70', '2027-12-19', '40'),
  (15, 'Fideos tornillo 500 g', 2, 11, '95', 'unid', '2.70', '2027-11-29', '30'),
  (16, 'Galletas Oreo (paquete)', 2, 12, '140', 'unid', '1.80', '2027-05-13', '50'),
  (17, 'Galletas saladas (paquete)', 2, 12, '85', 'unid', '1.50', '2027-04-03', '30'),
  (18, 'Mayonesa 400 g (frasco)', 2, 13, '55', 'unid', '9.90', '2027-09-20', '15'),
  (19, 'Sopa instantánea (sobre)', 2, 13, '100', 'unid', '1.80', '2027-11-09', '30'),
  (20, 'Leche UHT light 1 L', 2, 14, '65', 'unid', '5.30', '2027-03-14', '25'),
  (21, 'Aceite vegetal 5 L', 2, 5, '30', 'unid', '46.90', '2027-07-12', '10'),
  (22, 'Fideos canutón 500 g', 2, 5, '110', 'unid', '2.80', '2027-11-19', '35'),
  (23, 'Harina preparada 1 kg', 2, 5, '60', 'unid', '5.20', '2027-04-13', '20'),
  (24, 'Refresco instantáneo (sobre)', 2, 5, '200', 'unid', '0.80', '2027-09-20', '60'),
  (25, 'Mazamorra instantánea (sobre)', 2, 5, '9', 'unid', '1.50', '2026-11-06', '15'),
  (26, 'Panetón (caja)', 2, 5, '40', 'unid', '14.90', '2027-01-28', '15'),
  (28, 'Leche evaporada light (tarro)', 2, 4, '85', 'unid', '4.40', '2027-10-10', '30'),
  (29, 'Leche condensada (tarro)', 2, 4, '50', 'unid', '6.50', '2027-12-19', '15'),
  (30, 'Leche en polvo entera (lata)', 2, 4, '6', 'unid', '38.00', '2027-08-21', '8'),
  (31, 'Leche chocolatada UHT 200 ml', 2, 4, '150', 'unid', '1.80', '2027-04-23', '50'),
  (32, 'Cerveza Arequipeña 620 ml', 3, 6, '70', 'unid', '6.00', '2027-06-12', '25'),
  (33, 'Cerveza San Juan 620 ml', 3, 6, '50', 'unid', '6.50', '2026-11-08', '20'),
  (34, 'Cerveza Cristal lata 355 ml', 3, 6, '200', 'unid', '3.50', '2027-08-01', '60'),
  (35, 'Inca Kola 2 L', 3, 7, '95', 'unid', '6.50', '2027-02-12', '30'),
  (36, 'Sprite 1.5 L', 3, 7, '75', 'unid', '5.50', '2027-02-02', '25'),
  (37, 'Kola Inglesa 1.5 L', 3, 7, '14', 'unid', '5.00', '2027-01-23', '20'),
  (38, 'Néctar de naranja 1 L', 3, 7, '65', 'unid', '4.80', '2027-05-13', '20'),
  (39, 'Agua de mesa 2.5 L', 3, 7, '80', 'unid', '3.50', '2028-03-08', '25'),
  (40, 'Agua saborizada 500 ml', 3, 7, '120', 'unid', '2.50', '2027-03-24', '40'),
  (41, 'Cereal de hojuelas de maíz (caja)', 2, 8, '55', 'unid', '11.50', '2027-08-11', '15'),
  (42, 'Bebida achocolatada en polvo (lata)', 2, 8, '40', 'unid', '18.90', '2027-10-20', '12'),
  (43, 'Barra de chocolate con leche 40 g', 2, 9, '180', 'unid', '1.50', '2026-11-02', '50'),
  (44, 'Bombones surtidos (caja)', 2, 9, '25', 'unid', '16.90', '2027-06-02', '8'),
  (45, 'Fideos corbata 500 g', 2, 11, '90', 'unid', '2.70', '2027-12-09', '30'),
  (46, 'Fideos cabello de ángel 250 g', 2, 11, '70', 'unid', '1.80', '2027-11-09', '25'),
  (47, 'Galletas de chocolate con crema (paquete)', 2, 12, '130', 'unid', '1.80', '2027-04-13', '40'),
  (48, 'Ketchup 400 g (frasco)', 2, 13, '48', 'unid', '7.90', '2027-08-31', '15'),
  (49, 'Sazonador completo (sobre)', 2, 13, '160', 'unid', '0.90', '2027-11-29', '50')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('productos', 'id'), (SELECT MAX(id) FROM "productos"));

INSERT INTO "perdidas" ("id", "producto_nombre", "cantidad", "unidad", "monto_perdido", "fecha_vencimiento", "eliminado_por", "eliminado_en") OVERRIDING SYSTEM VALUE VALUES
  (1, 'azucar', '5.00', 'KG', '12.50', '2026-10-10', 1, '2026-10-25 21:53:27.830171'),
  (2, 'Té de manzanilla filtrante (caja)', '75.00', 'unid', '240.00', '2026-10-22', 1, '2026-10-25 21:53:29.075062'),
  (3, 'Galletas de vainilla (paquete)', '100.00', 'unid', '120.00', '2026-10-20', 1, '2026-10-25 21:53:30.377499'),
  (4, 'leche', '50.00', 'unidades', '155.00', '2025-12-10', 1, '2026-10-25 21:53:31.859079')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('perdidas', 'id'), (SELECT MAX(id) FROM "perdidas"));

INSERT INTO "movimientos" ("id", "producto_id", "producto_nombre", "tipo", "cantidad", "stock_anterior", "stock_nuevo", "motivo", "usuario_id", "creado_en") OVERRIDING SYSTEM VALUE VALUES
  (1, 2, 'atun', 'ajuste', '12321', '12', '12333', 'compra', 1, '2026-10-25 21:44:15.020734')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('movimientos', 'id'), (SELECT MAX(id) FROM "movimientos"));

