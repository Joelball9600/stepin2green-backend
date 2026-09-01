-- Stepin2Green — volunteers table
--
-- STEP 1: run this on its own first, then refresh the Schemas panel:
--
--     CREATE DATABASE stepin2green;
--
-- STEP 2: then run the statement below.
--
-- The table name is fully qualified (stepin2green.volunteers) on purpose, so
-- it works no matter which database the SQL Editor has selected. There is no
-- USE statement — the web editor runs one statement at a time and USE doesn't
-- carry over between runs.
--
-- `instagram` is nullable because submissions from before the field existed
-- have no handle. New submissions still require one — that's enforced in
-- src/index.js, so historical rows import cleanly without weakening the form.

CREATE TABLE IF NOT EXISTS stepin2green.volunteers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  instagram    VARCHAR(255) DEFAULT NULL,
  background   VARCHAR(500) DEFAULT NULL,
  team         VARCHAR(100) DEFAULT NULL,
  message      TEXT         DEFAULT NULL,
  submitted_at DATETIME     NOT NULL,
  INDEX idx_submitted_at (submitted_at)
);
