INSERT IGNORE INTO plans (code, name, price_mxn, stripe_price_id, features_json) VALUES
('basic', 'Básico', 399, 'price_XXXX_basic', JSON_OBJECT('gallery', 4, 'rsvp', true, 'music', false)),
('pro',   'Pro',   699, 'price_XXXX_pro',   JSON_OBJECT('gallery', 8, 'rsvp', true, 'music', true)),
('elite', 'Elite', 999, 'price_XXXX_elite', JSON_OBJECT('gallery',12, 'rsvp', true, 'music', true, 'custom_domain', true));

INSERT IGNORE INTO templates (key_name, name, preview_img, demo_theme_json) VALUES
('default','Clásica','/public/img/placeholder.jpg', JSON_OBJECT(
  'colors', JSON_OBJECT('bg','#0e0e1a','text','#f5f4f7','accent','#4c3b33','muted','#b5b1aa','ring','#cdcbc9'),
  'media', JSON_OBJECT('video','/public/video/sample.mp4','poster','/public/img/placeholder.jpg','gallery', JSON_ARRAY('/public/img/placeholder.jpg')),
  'copy', JSON_OBJECT('intro','Reserva la fecha y acompáñanos en este día especial.')
)),
('elegant','Elegante','/public/img/placeholder.jpg', JSON_OBJECT(
  'colors', JSON_OBJECT('bg','#0e0e1a','text','#f5f4f7','accent','#4c3b33','muted','#b5b1aa','ring','#cdcbc9'),
  'media', JSON_OBJECT('video','/public/video/sample.mp4','poster','/public/img/placeholder.jpg','gallery', JSON_ARRAY('/public/img/placeholder.jpg')),
  'copy', JSON_OBJECT('intro','Una celebración con estilo.')
));