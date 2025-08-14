CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  price_mxn INT NOT NULL,
  stripe_price_id VARCHAR(120) NOT NULL,
  features_json JSON NOT NULL,
  active TINYINT(1) DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  status ENUM('pending','paid','expired','cancelled') DEFAULT 'pending',
  stripe_session_id VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  key_name VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  preview_img VARCHAR(255),
  demo_theme_json JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  template_key VARCHAR(64) NOT NULL,
  slug VARCHAR(120) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  date_iso VARCHAR(40) NOT NULL,
  date_locked TINYINT(1) DEFAULT 0,
  slug_locked TINYINT(1) DEFAULT 0,
  venue VARCHAR(200) NOT NULL,
  address VARCHAR(250) NOT NULL,
  dresscode VARCHAR(120) DEFAULT 'Elegante',
  theme_json JSON NOT NULL,
  status ENUM('draft','active','archived') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS rsvps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invitation_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  guests INT DEFAULT 0,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invitation_id) REFERENCES invitations(id)
);