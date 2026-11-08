-- Miniatura de las imágenes adjuntas: un objeto pequeño aparte (webp de unos 240 px) que genera el navegador al subir.
-- Así la lista de archivos muestra la vista previa sin descargar la foto completa (que pesa hasta 15 MB).
alter table public.contract_files add column if not exists thumb_path text;
